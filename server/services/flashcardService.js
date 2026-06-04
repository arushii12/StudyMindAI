import mongoose from "mongoose";
import Document from "../models/Document.js";
import Flashcard from "../models/Flashcard.js";
import FlashcardProgress from "../models/FlashcardProgress.js";
import FlashcardSet from "../models/FlashcardSet.js";
import Summary from "../models/Summary.js";
import { generateFlashcards, getActiveAiModelName } from "./aiService.js";
import { isDatabaseConnected } from "../config/db.js";
import { buildSelectedPdfSource } from "./selectedPdfSourceService.js";

const CARD_MIN = 10;
const CARD_MAX = 18;
const DEFAULT_CARD_COUNT = 12;

export async function getFlashcardsForUser(user, options = {}) {
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Flashcards require stored documents.");
    error.status = 503;
    throw error;
  }

  const document = await findSelectedDocument(user.id, options.documentId);

  if (!document) {
    const error = new Error("No uploaded document found for flashcards.");
    error.status = 404;
    throw error;
  }

  const set = await FlashcardSet.findOne({ userId: user.id, documentId: document._id })
    .sort({ generatedAt: -1, updatedAt: -1 })
    .lean();

  if (!set) {
    return {
      document: mapDocument(document),
      flashcardSet: null,
      progress: null,
      meta: {
        hasFlashcards: false,
        reused: false
      }
    };
  }

  const progress = await getOrCreateProgress(user.id, set._id, set.cards.length);

  return {
    document: mapDocument(document),
    flashcardSet: mapFlashcardSet(set),
    progress: mapProgress(progress),
    meta: {
      hasFlashcards: true,
      reused: true
    }
  };
}

export async function generateFlashcardsForUser(user, payload = {}) {
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Configure MONGO_URI before generating flashcards.");
    error.status = 503;
    throw error;
  }

  const selectedSource = await buildSelectedPdfSource(user, payload);
  const document = selectedSource?.primaryDocument || await findSelectedDocument(user.id, payload.documentId);

  if (!document) {
    const error = new Error("No uploaded document found for flashcard generation.");
    error.status = 404;
    throw error;
  }

  const source = selectedSource || await getFlashcardSource(user.id, document);
  const cardCount = normalizeCardCount(payload.cardCount);
  const generated = await generateFlashcards(source.text, {
    documentTitle: source.title || getDocumentDisplayName(document),
    subject: source.subject || document.subject,
    cardCount,
    scope: source.scope || "single-document"
  });
  const validCards = validateCards(generated.flashcards || generated.cards);

  if (validCards.length < CARD_MIN) {
    const error = new Error("AI returned too few valid flashcards. Please regenerate.");
    error.status = 422;
    throw error;
  }

  const set = await FlashcardSet.create({
    userId: user.id,
    documentId: document._id,
    sourceSummaryId: source.summaryId,
    folderId: source.folderId || document.folderId || null,
    selectedDocumentIds: source.selectedDocumentIds || [document._id],
    generationType: selectedSource ? "selected" : "single",
    title: selectedSource ? `${source.title} Flashcards` : `${getDocumentDisplayName(document)} Flashcards`,
    topic: source.subject || document.subject,
    source: source.type,
    aiModel: getActiveAiModelName(),
    cards: validCards.map((card, index) => ({
      ...card,
      order: index + 1
    })),
    generatedAt: new Date()
  });

  await Flashcard.deleteMany({ userId: user.id, documentId: document._id });
  await Flashcard.insertMany(
    set.cards.map((card) => ({
      userId: user.id,
      documentId: document._id,
      subject: source.subject || document.subject,
      topic: card.topic || source.subject || document.subject,
      front: card.front,
      back: card.back,
      mastered: false,
      reviewedAt: null
    }))
  );

  const progress = await FlashcardProgress.findOneAndUpdate(
    { userId: user.id, flashcardSetId: set._id },
    {
      userId: user.id,
      flashcardSetId: set._id,
      currentCardIndex: 0,
      masteredCount: 0,
      learningCount: 0,
      reviewHistory: [],
      lastStudiedAt: new Date()
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return {
    document: mapDocument(document),
    flashcardSet: mapFlashcardSet(set.toObject()),
    progress: mapProgress(progress),
    meta: {
      hasFlashcards: true,
      reused: false
    }
  };
}

export async function saveFlashcardReviewForUser(user, setId, payload = {}) {
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Flashcard review progress requires persistence.");
    error.status = 503;
    throw error;
  }

  if (!mongoose.Types.ObjectId.isValid(setId)) {
    const error = new Error("Invalid flashcard set id.");
    error.status = 400;
    throw error;
  }

  const set = await FlashcardSet.findOne({ _id: setId, userId: user.id });

  if (!set) {
    const error = new Error("Flashcard set not found.");
    error.status = 404;
    throw error;
  }

  await sanitizeLegacyFlashcardRatings(user.id, set._id);

  const currentCardIndex = clampIndex(payload.currentCardIndex, set.cards.length);
  const rating = normalizeRating(payload.rating);
  const cardOrder = Math.min(set.cards.length, Math.max(1, Number(payload.cardOrder || currentCardIndex + 1)));
  const update = {
    $set: {
      currentCardIndex,
      lastStudiedAt: new Date()
    }
  };

  if (rating) {
    update.$push = {
      reviewHistory: {
        cardOrder,
        rating,
        reviewedAt: new Date()
      }
    };
  }

  const progress = await FlashcardProgress.findOneAndUpdate(
    { userId: user.id, flashcardSetId: set._id },
    update,
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const history = progress.reviewHistory || [];
  progress.masteredCount = new Set(history.filter((item) => item.rating === "got-it").map((item) => item.cardOrder)).size;
  progress.learningCount = new Set(history.filter((item) => item.rating !== "got-it").map((item) => item.cardOrder)).size;
  await progress.save();

  set.lastStudiedAt = new Date();
  await set.save();

  return {
    progress: mapProgress(progress)
  };
}

export async function getFlashcardProgressForUser(user, setId) {
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Flashcard progress requires persistence.");
    error.status = 503;
    throw error;
  }

  if (!mongoose.Types.ObjectId.isValid(setId)) {
    const error = new Error("Invalid flashcard set id.");
    error.status = 400;
    throw error;
  }

  const set = await FlashcardSet.findOne({ _id: setId, userId: user.id }).lean();

  if (!set) {
    const error = new Error("Flashcard set not found.");
    error.status = 404;
    throw error;
  }

  const progress = await getOrCreateProgress(user.id, set._id, set.cards.length);

  return {
    progress: mapProgress(progress)
  };
}

export async function deleteFlashcardSetForUser(user, setId) {
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Flashcards require stored documents.");
    error.status = 503;
    throw error;
  }

  if (!mongoose.Types.ObjectId.isValid(setId)) {
    const error = new Error("Invalid flashcard set id.");
    error.status = 400;
    throw error;
  }

  const set = await FlashcardSet.findOneAndDelete({ _id: setId, userId: user.id }).lean();

  if (!set) {
    const error = new Error("Flashcard set not found.");
    error.status = 404;
    throw error;
  }

  await FlashcardProgress.deleteMany({ userId: user.id, flashcardSetId: setId });

  return {
    deletedFlashcardSetId: setId,
    message: "Flashcards deleted successfully."
  };
}

async function findSelectedDocument(userId, documentId) {
  if (documentId) {
    if (!mongoose.Types.ObjectId.isValid(documentId)) {
      const error = new Error("Invalid document id.");
      error.status = 400;
      throw error;
    }

    return Document.findOne({ _id: documentId, userId }).lean();
  }

  return Document.findOne({ userId, status: { $ne: "archived" } })
    .sort({ lastStudiedAt: -1, updatedAt: -1 })
    .lean();
}

async function getFlashcardSource(userId, document) {
  const summary = await Summary.findOne({ userId, documentId: document._id })
    .sort({ generatedAt: -1, updatedAt: -1 })
    .lean();
  const summaryText = [
    summary?.content?.detailed,
    summary?.content?.medium,
    summary?.summaryText
  ].filter(Boolean).join("\n\n");

  if (countWords(summaryText) >= 80) {
    return {
      type: "summary",
      summaryId: summary._id,
      text: summaryText
    };
  }

  if (countWords(document.extractedText) >= 80) {
    return {
      type: "document",
      summaryId: null,
      text: document.extractedText
    };
  }

  const error = new Error("Not enough extracted study material is available to generate useful flashcards.");
  error.status = 422;
  throw error;
}

function validateCards(cards) {
  if (!Array.isArray(cards)) {
    return [];
  }

  const seen = new Set();

  return cards
    .map(normalizeCard)
    .filter(Boolean)
    .filter((card) => {
      const key = card.front.toLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, CARD_MAX);
}

function normalizeCard(card) {
  if (!card || typeof card !== "object") {
    return null;
  }

  const normalized = {
    front: String(card.front || "").trim(),
    back: String(card.back || "").trim(),
    topic: String(card.topic || "").trim(),
    difficulty: String(card.difficulty || "medium").toLowerCase()
  };

  if (!normalized.front || !normalized.back) {
    return null;
  }

  if (countWords(normalized.front) > 24 || countWords(normalized.back) > 80) {
    return null;
  }

  if (!["easy", "medium", "hard"].includes(normalized.difficulty)) {
    normalized.difficulty = "medium";
  }

  return normalized;
}

async function getOrCreateProgress(userId, setId, cardCount) {
  await sanitizeLegacyFlashcardRatings(userId, setId);

  return FlashcardProgress.findOneAndUpdate(
    { userId, flashcardSetId: setId },
    {
      $setOnInsert: {
        userId,
        flashcardSetId: setId,
        currentCardIndex: 0,
        masteredCount: 0,
        learningCount: 0,
        reviewHistory: [],
        lastStudiedAt: null
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).then((progress) => {
    progress.currentCardIndex = clampIndex(progress.currentCardIndex, cardCount);
    return progress.save();
  });
}

function mapFlashcardSet(set) {
  return {
    id: set._id.toString(),
    documentId: set.documentId?.toString?.() || null,
    title: set.title,
    topic: set.topic,
    source: set.source,
    folderId: set.folderId?.toString?.() || null,
    selectedDocumentIds: (set.selectedDocumentIds || []).map((id) => id.toString()),
    generationType: set.generationType || "single",
    cards: set.cards.map((card) => ({
      id: card._id?.toString?.(),
      front: card.front,
      back: card.back,
      topic: card.topic,
      difficulty: card.difficulty,
      order: card.order
    })),
    generatedAt: set.generatedAt,
    lastStudiedAt: set.lastStudiedAt
  };
}

function mapProgress(progress) {
  return {
    currentCardIndex: progress.currentCardIndex || 0,
    masteredCount: progress.masteredCount || 0,
    learningCount: progress.learningCount || 0,
    lastStudiedAt: progress.lastStudiedAt,
    reviewHistory: normalizeReviewHistory(progress.reviewHistory || [])
  };
}

function mapDocument(document) {
  const displayName = getDocumentDisplayName(document);

  return {
    id: document._id.toString(),
    title: displayName,
    displayName,
    subject: document.subject,
    pageCount: document.pageCount || 0
  };
}

function getDocumentDisplayName(document) {
  return String(document.displayName || document.title || document.originalFileName || "Study Material")
    .replace(/\.pdf$/i, "")
    .replace(/\s+/g, " ")
    .trim() || "Study Material";
}

function normalizeCardCount(count) {
  const parsed = Number(count || DEFAULT_CARD_COUNT);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_CARD_COUNT;
  }

  return Math.min(CARD_MAX, Math.max(CARD_MIN, Math.round(parsed)));
}

function normalizeRating(rating) {
  const normalized = String(rating || "").toLowerCase();
  return ["again", "got-it"].includes(normalized) ? normalized : "";
}

async function sanitizeLegacyFlashcardRatings(userId, setId) {
  await FlashcardProgress.updateOne(
    { userId, flashcardSetId: setId, "reviewHistory.rating": "almost" },
    { $set: { "reviewHistory.$[item].rating": "got-it" } },
    { arrayFilters: [{ "item.rating": "almost" }] }
  );
}

function normalizeReviewHistory(history) {
  return history.map((item) => ({
    cardOrder: item.cardOrder,
    rating: item.rating === "almost" ? "got-it" : item.rating,
    reviewedAt: item.reviewedAt
  }));
}

function clampIndex(index, count) {
  if (!count) {
    return 0;
  }

  const parsed = Number(index || 0);
  return Math.min(count - 1, Math.max(0, Number.isFinite(parsed) ? Math.round(parsed) : 0));
}

function countWords(text) {
  return String(text || "").split(/\s+/).filter(Boolean).length;
}
