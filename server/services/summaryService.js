import mongoose from "mongoose";
import Document from "../models/Document.js";
import Summary from "../models/Summary.js";
import ImportantQuestion from "../models/ImportantQuestion.js";
import { generateStudyAssistantAnswer, generateSummary } from "./aiService.js";
import { isDatabaseConnected } from "../config/db.js";
import { buildSelectedPdfSource } from "./selectedPdfSourceService.js";

export async function getSummaryForUser(user, options = {}) {
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Summaries require stored documents.");
    error.status = 503;
    throw error;
  }

  const document = await findSelectedDocument(user.id, options.documentId);

  if (!document) {
    const error = new Error("No uploaded document found for summaries.");
    error.status = 404;
    throw error;
  }

  const summary = await Summary.findOne({ userId: user.id, documentId: document._id }).lean();

  if (!summary) {
    return {
      document: mapDocument(document),
      summary: null,
      questions: [],
      links: buildLinks(document._id),
      meta: {
        hasSummary: false,
        source: "database"
      }
    };
  }

  if (!hasValidSummaryLengths(summary.content)) {
    return generateSummaryForUser(user, {
      documentId: document._id.toString(),
      length: options.length || summary.activeLength
    });
  }

  const questions = await ImportantQuestion.find({ summaryId: summary._id })
    .sort({ order: 1 })
    .lean();

  return mapSummaryResponse(document, summary, questions, options.length);
}

export async function generateSummaryForUser(user, payload = {}) {
  const length = normalizeLength(payload.length);

  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Configure MONGO_URI before generating summaries.");
    error.status = 503;
    throw error;
  }

  const selectedSource = await buildSelectedPdfSource(user, payload);
  const document = selectedSource?.primaryDocument || await findSelectedDocument(user.id, payload.documentId);

  if (!document) {
    const error = new Error("No document found to summarize.");
    error.status = 404;
    throw error;
  }

  const sourceText = selectedSource?.text || document.extractedText;

  if (countWords(sourceText) < 40) {
    const error = new Error("Not enough extracted study material is available to generate a summary.");
    error.status = 422;
    throw error;
  }

  const generated = await generateSummary(sourceText, {
    documentTitle: selectedSource?.title || getDocumentDisplayName(document),
    subject: selectedSource?.subject || document.subject,
    scope: selectedSource?.scope || "single-document"
  });
  const content = validateSummaryContent(generated.content);
  const generatedQuestions = validateImportantQuestions(generated.questions);

  const summary = await Summary.findOneAndUpdate(
    { userId: user.id, documentId: document._id },
    {
      userId: user.id,
      documentId: document._id,
      folderId: selectedSource?.folderId || document.folderId || null,
      selectedDocumentIds: selectedSource?.selectedDocumentIds || [document._id],
      generationType: selectedSource ? "selected" : "single",
      activeLength: length,
      summaryLength: length,
      summaryText: content[length],
      importantQuestions: generatedQuestions,
      content,
      source: "generated",
      generatedAt: new Date()
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const documentUpdate = payload.markStudied === false
    ? { summaryGenerated: true }
    : { summaryGenerated: true, lastStudiedAt: new Date() };

  await Document.findByIdAndUpdate(document._id, documentUpdate);

  await ImportantQuestion.deleteMany({ summaryId: summary._id });
  const questions = await ImportantQuestion.insertMany(
    generatedQuestions.map((question, index) => ({
      userId: user.id,
      documentId: document._id,
      summaryId: summary._id,
      question,
      order: index + 1
    }))
  );

  return mapSummaryResponse(document, summary.toObject(), questions, length);
}

export async function getQuestionsForSummary(user, summaryId) {
  if (!mongoose.Types.ObjectId.isValid(summaryId)) {
    const error = new Error("Invalid summary id.");
    error.status = 400;
    throw error;
  }

  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Important questions require stored summaries.");
    error.status = 503;
    throw error;
  }

  const questions = await ImportantQuestion.find({ userId: user.id, summaryId })
    .sort({ order: 1 })
    .lean();

  return questions.map(mapQuestion);
}

export async function deleteSummaryForUser(user, summaryId) {
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Summaries require stored documents.");
    error.status = 503;
    throw error;
  }

  if (!mongoose.Types.ObjectId.isValid(summaryId)) {
    const error = new Error("Invalid summary id.");
    error.status = 400;
    throw error;
  }

  const result = await Summary.deleteOne({ _id: summaryId, userId: user.id });

  if (!result.deletedCount) {
    const error = new Error("Summary not found.");
    error.status = 404;
    throw error;
  }

  return {
    deletedSummaryId: summaryId,
    message: "Summary deleted successfully."
  };
}

export async function chatWithSummaryAssistant(user, documentId, payload = {}) {
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Study assistant requires stored documents.");
    error.status = 503;
    throw error;
  }

  const message = String(payload.message || "").replace(/\s+/g, " ").trim();

  if (!message) {
    const error = new Error("Ask a question before sending.");
    error.status = 400;
    throw error;
  }

  const document = await findSelectedDocument(user.id, documentId);

  if (!document) {
    const error = new Error("No document found for this study assistant chat.");
    error.status = 404;
    throw error;
  }

  const summary = await Summary.findOne({ userId: user.id, documentId: document._id }).lean();
  const length = normalizeLength(payload.length || summary?.activeLength);
  const summaryText = summary?.content?.[length] || summary?.summaryText || "";
  const notesText = document.extractedText || "";

  if (countWords(notesText) < 20 && countWords(summaryText) < 20) {
    const error = new Error("Not enough notes or summary content is available for the study assistant.");
    error.status = 422;
    throw error;
  }

  const generated = await generateStudyAssistantAnswer(notesText, {
    documentTitle: getDocumentDisplayName(document),
    subject: document.subject,
    summaryText,
    length,
    message,
    history: normalizeChatHistory(payload.history)
  });
  const answer = String(generated.answer || "").replace(/\s+/g, " ").trim();
  const sourceType = ["notes", "summary", "general"].includes(generated.sourceType)
    ? generated.sourceType
    : "notes";

  if (!answer) {
    const error = new Error("AI did not return a study assistant answer.");
    error.status = 502;
    throw error;
  }

  return {
    answer,
    sourceType,
    document: mapDocument(document),
    meta: {
      modelContext: "document-summary-chat",
      length
    }
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

function mapSummaryResponse(document, summary, questions, requestedLength) {
  const activeLength = normalizeLength(requestedLength || summary.activeLength);

  return {
    document: mapDocument(document),
    summary: {
      id: summary._id.toString(),
      length: activeLength,
      content: summary.content,
      displayedContent: summary.content[activeLength],
      status: "Summary Generated",
      source: summary.source,
      folderId: summary.folderId?.toString?.() || null,
      selectedDocumentIds: (summary.selectedDocumentIds || []).map((id) => id.toString()),
      generationType: summary.generationType || "single",
      generatedAt: summary.generatedAt,
      updatedAt: summary.updatedAt
    },
    questions: questions.map(mapQuestion),
    links: buildLinks(document._id),
    meta: {
      hasSummary: true,
      source: "database"
    }
  };
}

function mapDocument(document) {
  const displayName = getDocumentDisplayName(document);

  return {
    id: document._id?.toString?.() || document.id,
    title: displayName,
    displayName,
    subject: document.subject,
    fileType: document.fileType,
    pageCount: document.pageCount || 0,
    uploadedAt: document.createdAt || document.uploadedAt,
    updatedAt: document.updatedAt
  };
}

function getDocumentDisplayName(document) {
  return String(document.displayName || document.title || document.originalFileName || "Study Material")
    .replace(/\.pdf$/i, "")
    .replace(/\s+/g, " ")
    .trim() || "Study Material";
}

function mapQuestion(question) {
  return {
    id: question._id?.toString?.() || `question-${question.order}`,
    order: question.order,
    question: question.question
  };
}

function normalizeChatHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .map((message) => ({
      role: message?.role === "assistant" ? "assistant" : "user",
      content: String(message?.content || "").replace(/\s+/g, " ").trim().slice(0, 1200)
    }))
    .filter((message) => message.content)
    .slice(-8);
}

function buildLinks(documentId) {
  return {
    quiz: `#quizzes?documentId=${documentId}`,
    flashcards: `#flashcards?documentId=${documentId}`
  };
}

function normalizeLength(length = "short") {
  return ["short", "medium", "detailed"].includes(length) ? length : "short";
}

function validateSummaryContent(content = {}) {
  const normalized = {
    short: cleanSummaryOutput(content.short),
    medium: cleanSummaryOutput(content.medium),
    detailed: cleanSummaryOutput(content.detailed)
  };

  const shortWords = countWords(normalized.short);
  const mediumWords = countWords(normalized.medium);
  const detailedWords = countWords(normalized.detailed);

  if (shortWords < 45 || mediumWords < 120 || detailedWords < 350) {
    const error = new Error("AI returned an incomplete summary. Please regenerate.");
    error.status = 422;
    throw error;
  }

  if (hasFormattingNoise(normalized.short) || hasFormattingNoise(normalized.medium) || hasFormattingNoise(normalized.detailed)) {
    const error = new Error("AI returned poorly formatted summary content. Please regenerate.");
    error.status = 422;
    throw error;
  }

  if (hasGenericSummaryHeadings(normalized.short) || hasGenericSummaryHeadings(normalized.medium) || hasGenericSummaryHeadings(normalized.detailed)) {
    const error = new Error("AI returned generic summary headings. Please regenerate.");
    error.status = 422;
    throw error;
  }

  return normalized;
}

function validateImportantQuestions(questions) {
  const values = Array.isArray(questions)
    ? questions.map((question) => String(question || "").trim()).filter(Boolean)
    : [];
  const uniqueQuestions = [...new Set(values)].slice(0, 5);

  if (uniqueQuestions.length < 3) {
    const error = new Error("AI returned too few important questions. Please regenerate.");
    error.status = 422;
    throw error;
  }

  return uniqueQuestions;
}

function cleanSummaryOutput(text) {
  return String(text || "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/:\./g, ".")
    .replace(/\.{2,}/g, ".")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function countWords(text) {
  return String(text || "").split(/\s+/).filter(Boolean).length;
}

function hasValidSummaryLengths(content = {}) {
  const shortWords = countWords(content.short);
  const mediumWords = countWords(content.medium);
  const detailedWords = countWords(content.detailed);

  return shortWords >= 60
    && mediumWords >= 150
    && detailedWords >= 500
    && !hasFormattingNoise(content.short)
    && !hasFormattingNoise(content.medium)
    && !hasFormattingNoise(content.detailed);
}

function hasFormattingNoise(text) {
  return /[•●○▪▫]|\s\d+[\).]\s*($|[A-Z])|\s[.;:,]|:\.|\.\./g.test(String(text || ""));
}

function hasGenericSummaryHeadings(text) {
  return String(text || "")
    .split(/\n+/)
    .some((line) => {
      const heading = line.split(":")[0]?.trim() || "";
      return /^(study note\s*\d*|revision strategy|exam focus|important note|learning point|topic\s*\d+|finally|here|therefore|however|moreover|furthermore|in addition|this means|for example|a public cloud)$/i.test(heading);
    });
}
