// Import Mongoose so we can validate MongoDB ObjectIds before querying.
import mongoose from "mongoose";
// Document stores uploaded PDFs and pasted text used as flashcard source material.
import Document from "../models/Document.js";
// Flashcard stores searchable individual cards for dashboard features.
import Flashcard from "../models/Flashcard.js";
// FlashcardSet stores one complete generated deck.
import FlashcardSet from "../models/FlashcardSet.js";
// Summary is reused as a cleaner source when a summary already exists for a document.
import Summary from "../models/Summary.js";
// AI service builds cards and reports which model generated them.
import { generateFlashcards, getActiveAiModelName } from "./aiService.js";
// Database state is checked before any MongoDB-heavy flashcard work.
import { isDatabaseConnected } from "../config/db.js";
// Selected PDF source combines multiple documents into one AI prompt source.
import { buildSelectedPdfSource } from "./selectedPdfSourceService.js";

// Minimum number of valid cards required before saving an AI deck.
const CARD_MIN = 10;
// Maximum number of cards the service allows in one deck.
const CARD_MAX = 18;
// Default card count when React does not send a value.
const DEFAULT_CARD_COUNT = 12;

// Called when the Flashcards page opens.
// It loads an existing deck instead of calling AI immediately.
export async function getFlashcardsForUser(user, options = {}) {
  // Flashcards are user-specific and stored in MongoDB, so both are required.
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Flashcards require stored documents.");
    error.status = 503;
    throw error;
  }

  let set = null;
  let document = null;

  // If React sends setId, it wants one exact deck.
  if (options.setId) {
    // Validate the id before running a MongoDB query.
    if (!mongoose.Types.ObjectId.isValid(options.setId)) {
      const error = new Error("Invalid flashcard set id.");
      error.status = 400;
      throw error;
    }

    // Find the deck only if it belongs to the current user.
    set = await FlashcardSet.findOne({ _id: options.setId, userId: user.id }).lean();

    if (!set) {
      const error = new Error("Flashcard set not found.");
      error.status = 404;
      throw error;
    }

    // Load the document connected to the deck.
    document = await findSelectedDocument(user.id, set.documentId);
  } else {
    // Without setId, choose the selected document or the user's newest document.
    document = await findSelectedDocument(user.id, options.documentId);
  }

  if (!document) {
    const error = new Error("No uploaded document found for flashcards.");
    error.status = 404;
    throw error;
  }

  if (!set) {
    // Reuse the newest deck for this document if one already exists.
    set = await FlashcardSet.findOne({ userId: user.id, documentId: document._id })
      .sort({ generatedAt: -1, updatedAt: -1 })
      .lean();
  }

  if (!set) {
    // Tell React there is no deck yet so it can show the Generate button.
    return {
      document: mapDocument(document),
      flashcardSet: null,
      meta: {
        hasFlashcards: false,
        reused: false
      }
    };
  }

  // Return mapped data in the exact shape React renders.
  return {
    document: mapDocument(document),
    flashcardSet: mapFlashcardSet(set),
    meta: {
      hasFlashcards: true,
      reused: true
    }
  };
}

// Called when the user clicks Generate Flashcards.
// It selects source text, asks AI for cards, validates them, and saves the deck.
export async function generateFlashcardsForUser(user, payload = {}) {
  // A generated deck must be saved, so user and MongoDB are required.
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Configure MONGO_URI before generating flashcards.");
    error.status = 503;
    throw error;
  }

  // If the user selected multiple PDFs, combine them into one source for AI.
  const selectedSource = await buildSelectedPdfSource(user, payload);
  // Use the primary selected PDF, or the single document selected by documentId.
  const document = selectedSource?.primaryDocument || await findSelectedDocument(user.id, payload.documentId);

  if (!document) {
    const error = new Error("No uploaded document found for flashcard generation.");
    error.status = 404;
    throw error;
  }

  // Choose text from selected PDFs, an existing summary, or extracted document text.
  const source = selectedSource || await getFlashcardSource(user.id, document);
  // Keep React's requested card count inside the allowed range.
  const cardCount = normalizeCardCount(payload.cardCount);
  // Ask AI to create structured flashcards from the chosen study material.
  const generated = await generateFlashcards(source.text, {
    documentTitle: source.title || getDocumentDisplayName(document),
    subject: source.subject || document.subject,
    cardCount,
    scope: source.scope || "single-document"
  });
  // Clean AI output and remove invalid or duplicate cards before saving.
  const validCards = validateCards(generated.flashcards || generated.cards);

  // Reject weak AI output instead of storing a poor deck.
  if (validCards.length < CARD_MIN) {
    const error = new Error("AI returned too few valid flashcards. Please regenerate.");
    error.status = 422;
    throw error;
  }

  // Save the complete deck in MongoDB.
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
    // Add stable order numbers so the frontend can render cards in a predictable order.
    cards: validCards.map((card, index) => ({
      ...card,
      order: index + 1
    })),
    generatedAt: new Date()
  });

  // Remove old searchable card records for this document before inserting the new set.
  await Flashcard.deleteMany({ userId: user.id, documentId: document._id });
  // Save individual card records for dashboard queries.
  await Flashcard.insertMany(
    set.cards.map((card) => ({
      userId: user.id,
      documentId: document._id,
      subject: source.subject || document.subject,
      topic: card.topic || source.subject || document.subject,
      front: card.front,
      back: card.back
    }))
  );

  // Return the saved deck to React.
  return {
    document: mapDocument(document),
    flashcardSet: mapFlashcardSet(set.toObject()),
    meta: {
      hasFlashcards: true,
      reused: false
    }
  };
}

// Called when the user deletes a flashcard deck.
// It removes the generated deck for the current user.
export async function deleteFlashcardSetForUser(user, setId) {
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Flashcards require stored documents.");
    error.status = 503;
    throw error;
  }

  // Validate the deck id before delete operations.
  if (!mongoose.Types.ObjectId.isValid(setId)) {
    const error = new Error("Invalid flashcard set id.");
    error.status = 400;
    throw error;
  }

  // Delete only a deck owned by this user.
  const set = await FlashcardSet.findOneAndDelete({ _id: setId, userId: user.id }).lean();

  if (!set) {
    const error = new Error("Flashcard set not found.");
    error.status = 404;
    throw error;
  }

  return {
    deletedFlashcardSetId: setId,
    message: "Flashcards deleted successfully."
  };
}

// Find the selected source document.
// If React sends no documentId, use the user's most recently studied material.
async function findSelectedDocument(userId, documentId) {
  if (documentId) {
    // Validate documentId before using it in a MongoDB query.
    if (!mongoose.Types.ObjectId.isValid(documentId)) {
      const error = new Error("Invalid document id.");
      error.status = 400;
      throw error;
    }

    // Include userId so one user cannot open another user's document.
    return Document.findOne({ _id: documentId, userId }).lean();
  }

  // Fallback to the newest non-archived document for this user.
  return Document.findOne({ userId, status: { $ne: "archived" } })
    .sort({ lastStudiedAt: -1, updatedAt: -1 })
    .lean();
}

// Choose the best text source for AI flashcard generation.
// Summaries are preferred when they are long enough because they are cleaner than raw PDF text.
async function getFlashcardSource(userId, document) {
  if (document.fileType === "text" && countWords(document.extractedText) >= 80) {
    return {
      type: "document",
      summaryId: null,
      text: document.extractedText
    };
  }

  // Look for an existing summary owned by this user before using raw extracted text.
  const summary = await Summary.findOne({ userId, documentId: document._id })
    .sort({ generatedAt: -1, updatedAt: -1 })
    .lean();
  const summaryText = [
    summary?.content?.detailed,
    summary?.content?.medium,
    summary?.summaryText
  ].filter(Boolean).join("\n\n");

  // Use the summary only if it has enough words for meaningful cards.
  if (countWords(summaryText) >= 80) {
    return {
      type: "summary",
      summaryId: summary._id,
      text: summaryText
    };
  }

  // Fallback to extracted document text when no usable summary exists.
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

// Validate AI output before saving it to MongoDB.
// This removes bad cards, duplicates, and extra cards over the configured limit.
function validateCards(cards) {
  if (!Array.isArray(cards)) {
    return [];
  }

  // Track fronts so duplicate cards from AI are not saved.
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

// Normalize one AI card into the shape stored in FlashcardSet.
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

  // Keep cards short enough to work well in the flashcard UI.
  if (countWords(normalized.front) > 24 || countWords(normalized.back) > 80) {
    return null;
  }

  if (!["easy", "medium", "hard"].includes(normalized.difficulty)) {
    normalized.difficulty = "medium";
  }

  return normalized;
}

// Convert a MongoDB flashcard deck into the response shape React renders.
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

// Convert a MongoDB document into the small document object needed by Flashcards.
function mapDocument(document) {
  const displayName = getDocumentDisplayName(document);

  return {
    id: document._id.toString(),
    title: displayName,
    displayName,
    subject: document.subject,
    fileType: document.fileType,
    sourceType: document.sourceType || document.fileType,
    pageCount: document.pageCount || 0
  };
}

// Build the display name shown on the Flashcards page.
function getDocumentDisplayName(document) {
  return String(document.displayName || document.title || document.originalFileName || "Study Material")
    .replace(/\.pdf$/i, "")
    .replace(/\s+/g, " ")
    .trim() || "Study Material";
}

// Keep the requested card count inside the service limits.
function normalizeCardCount(count) {
  const parsed = Number(count || DEFAULT_CARD_COUNT);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_CARD_COUNT;
  }

  return Math.min(CARD_MAX, Math.max(CARD_MIN, Math.round(parsed)));
}

// Count words so validation can reject very short or oversized AI output.
function countWords(text) {
  return String(text || "").split(/\s+/).filter(Boolean).length;
}
