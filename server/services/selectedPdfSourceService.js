// Import Mongoose so selected PDF ids can be validated before querying.
import mongoose from "mongoose";
// Document stores the extracted text for each uploaded PDF.
import Document from "../models/Document.js";

// Called by summary, quiz, and flashcard services when multiple PDFs are selected.
// It combines selected documents into one AI-ready source object.
export async function buildSelectedPdfSource(user, payload = {}) {
  // React may send selected ids as documentIds or selectedDocumentIds.
  const selectedIds = normalizeSelectedDocumentIds(payload.documentIds || payload.selectedDocumentIds);

  if (!selectedIds.length) {
    return null;
  }

  // Load only selected PDFs owned by the current user.
  const documents = await Document.find({
    _id: { $in: selectedIds },
    userId: user.id,
    status: { $ne: "archived" }
  }).lean();
  // Preserve the order React sent by mapping fetched documents back to selectedIds.
  const byId = new Map(documents.map((document) => [document._id.toString(), document]));
  const orderedDocuments = selectedIds.map((id) => byId.get(id)).filter(Boolean);

  if (orderedDocuments.length !== selectedIds.length) {
    const error = new Error("One or more selected PDFs could not be found.");
    error.status = 404;
    throw error;
  }

  // Build labeled text blocks so AI can distinguish content from each PDF.
  const contentParts = orderedDocuments
    .map((document, index) => ({
      document,
      text: cleanText(document.extractedText),
      heading: getDocumentDisplayName(document) || `PDF ${index + 1}`
    }))
    .filter((item) => item.text);

  if (!contentParts.length) {
    const error = new Error("Selected PDFs do not contain extracted text for AI generation.");
    error.status = 422;
    throw error;
  }

  // Combine all selected PDFs into one prompt source.
  const text = contentParts
    .map((item) => `=== ${item.heading} ===\n\n${item.text}`)
    .join("\n\n");
  const primaryDocument = orderedDocuments[0];
  const folderId = payload.folderId || primaryDocument.folderId?.toString?.() || null;
  const subject = primaryDocument.folderName || primaryDocument.subject || "Selected PDFs";

  return {
    type: "selected",
    scope: "selected-pdfs",
    text,
    documents: orderedDocuments,
    primaryDocument,
    selectedDocumentIds: selectedIds,
    folderId,
    subject,
    title: `${subject} Selected PDFs`
  };
}

// Build a clean display name for headings inside the combined AI source.
function getDocumentDisplayName(document) {
  return String(document.displayName || document.title || document.originalFileName || "")
    .replace(/\.pdf$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Normalize selected PDF ids from an array or comma-separated string.
function normalizeSelectedDocumentIds(value) {
  const ids = Array.isArray(value)
    ? value
    : String(value || "").split(",");
  const cleaned = ids.map((id) => String(id || "").trim()).filter(Boolean);
  const unique = [...new Set(cleaned)];

  // Validate every id before any MongoDB query runs.
  if (unique.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    const error = new Error("Invalid selected PDF id.");
    error.status = 400;
    throw error;
  }

  return unique;
}

// Clean extracted text before placing it into an AI prompt.
function cleanText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}
