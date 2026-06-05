import mongoose from "mongoose";
import Document from "../models/Document.js";
import Summary from "../models/Summary.js";
import ImportantQuestion from "../models/ImportantQuestion.js";
import { generatePdfStudyNotes, generateStudyAssistantAnswer, generateSummary } from "./aiService.js";
import { isDatabaseConnected } from "../config/db.js";
import { buildSelectedPdfSource } from "./selectedPdfSourceService.js";
import {
  formatPdfNotesAsText,
  normalizePdfStudyNotes,
  sanitizeAiText
} from "./studyContentFormatter.js";

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

export async function generateSummaryPdfContentForUser(user, payload = {}) {
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Summary PDF generation requires stored summaries.");
    error.status = 503;
    throw error;
  }

  const pdfType = normalizePdfType(payload.pdfType);
  const length = normalizeLength(payload.length || "detailed");
  const document = await findSelectedDocument(user.id, payload.documentId);

  if (!document) {
    const error = new Error("No document found for this summary PDF.");
    error.status = 404;
    throw error;
  }

  const summary = await Summary.findOne({ userId: user.id, documentId: document._id }).lean();
  const summaryText = String(
    summary?.content?.detailed || summary?.content?.[length] || payload.summaryText || summary?.summaryText || ""
  ).trim();

  if (countWords(summaryText) < 40) {
    const error = new Error("Generate a summary before downloading a PDF.");
    error.status = 422;
    throw error;
  }

  const questionContext = pdfType === "detailed"
    ? normalizePdfQuestions(payload.questions)
    : [];
  const sourceMaterial = String(document.extractedText || "").trim();
  const sourceParts = [
    `Detailed AI summary:\n${summaryText}`,
    sourceMaterial ? `Original extracted study material:\n${sourceMaterial}` : "",
    questionContext.length
      ? `Important questions already identified from this material:\n${questionContext.map((question, index) => `Q${index + 1}. ${question}`).join("\n")}`
      : ""
  ].filter(Boolean);
  const pdfSourceText = sourceParts.join("\n\n");

  const generated = await generatePdfStudyNotes(pdfSourceText, {
    pdfType,
    documentTitle: getDocumentDisplayName(document),
    subject: document.subject
  });
  const normalizedPdf = normalizePdfStudyNotes(generated, pdfType);
  const notes = formatPdfNotesAsText(normalizedPdf.sections);

  if (!normalizedPdf.sections.length || countWords(notes) < 30) {
    const error = new Error("AI did not return usable PDF notes. Please try again.");
    error.status = 502;
    throw error;
  }

  return {
    pdfType,
    title: normalizedPdf.title,
    notes,
    sections: normalizedPdf.sections,
    importantQuestions: normalizedPdf.importantQuestions,
    document: mapDocument(document),
    meta: {
      generatedAt: new Date().toISOString()
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
  const content = normalizeStoredSummaryContent(summary);
  const displayedContent = content[activeLength]
    || content.detailed
    || content.medium
    || content.short;

  return {
    document: mapDocument(document),
    summary: {
      id: summary._id.toString(),
      length: activeLength,
      content,
      displayedContent,
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
      source: "database",
      needsRegeneration: !hasValidSummaryLengths(content)
    }
  };
}

function normalizeStoredSummaryContent(summary = {}) {
  const fallback = cleanSummaryOutput(summary.summaryText);
  const content = {
    short: cleanSummaryOutput(summary.content?.short),
    medium: cleanSummaryOutput(summary.content?.medium),
    detailed: cleanSummaryOutput(summary.content?.detailed)
  };

  if (!content.short && !content.medium && !content.detailed && fallback) {
    content[normalizeLength(summary.activeLength || summary.summaryLength)] = fallback;
  }

  return content;
}

function mapDocument(document) {
  const displayName = getDocumentDisplayName(document);

  return {
    id: document._id?.toString?.() || document.id,
    title: displayName,
    displayName,
    subject: document.subject,
    fileType: document.fileType,
    sourceType: document.sourceType || document.fileType,
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
    question: sanitizeAiText(question.question, { preserveLines: false })
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

function normalizePdfType(pdfType = "detailed") {
  return ["quick", "detailed"].includes(pdfType) ? pdfType : "detailed";
}

function normalizePdfQuestions(questions = []) {
  return Array.isArray(questions)
    ? questions
        .map((question) => String(question?.question || question || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];
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
  return removeRepeatedSummarySections(sanitizeAiText(text));
}

function removeRepeatedSummarySections(text) {
  const sections = String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (sections.length < 2 || sections.some((section) => !section.includes(":"))) {
    return String(text || "").trim();
  }

  const kept = [];
  const fingerprints = [];

  sections.forEach((section) => {
    const separatorIndex = section.indexOf(":");
    const heading = section.slice(0, separatorIndex).trim();
    const content = section.slice(separatorIndex + 1).trim();
    const fingerprint = buildSummaryFingerprint(content);
    const repeatsExisting = fingerprints.some((existing) => summaryOverlap(existing, fingerprint) >= 0.72);

    if (!repeatsExisting && heading && content) {
      kept.push(`${heading}: ${content}`);
      fingerprints.push(fingerprint);
    }
  });

  return kept.length ? kept.join("\n") : String(text || "").trim();
}

function buildSummaryFingerprint(text) {
  const ignoredWords = new Set([
    "about", "after", "also", "among", "and", "are", "been", "being", "between",
    "can", "document", "for", "from", "has", "have", "into", "its", "main",
    "more", "most", "that", "the", "their", "these", "this", "through", "uses",
    "using", "was", "were", "which", "with"
  ]);

  return new Set(
    String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !ignoredWords.has(word))
  );
}

function summaryOverlap(first, second) {
  if (!first.size || !second.size) {
    return 0;
  }

  const sharedWords = [...first].filter((word) => second.has(word)).length;
  return sharedWords / Math.min(first.size, second.size);
}

function countWords(text) {
  return String(text || "").split(/\s+/).filter(Boolean).length;
}

function hasValidSummaryLengths(content = {}) {
  const normalized = {
    short: cleanSummaryOutput(content.short),
    medium: cleanSummaryOutput(content.medium),
    detailed: cleanSummaryOutput(content.detailed)
  };
  const shortWords = countWords(normalized.short);
  const mediumWords = countWords(normalized.medium);
  const detailedWords = countWords(normalized.detailed);

  return shortWords >= 45
    && mediumWords >= 120
    && detailedWords >= 350
    && !hasFormattingNoise(normalized.short)
    && !hasFormattingNoise(normalized.medium)
    && !hasFormattingNoise(normalized.detailed);
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
