import mongoose from "mongoose";
import Document from "../models/Document.js";

export async function buildSelectedPdfSource(user, payload = {}) {
  const selectedIds = normalizeSelectedDocumentIds(payload.documentIds || payload.selectedDocumentIds);

  if (!selectedIds.length) {
    return null;
  }

  const documents = await Document.find({
    _id: { $in: selectedIds },
    userId: user.id,
    status: { $ne: "archived" }
  }).lean();
  const byId = new Map(documents.map((document) => [document._id.toString(), document]));
  const orderedDocuments = selectedIds.map((id) => byId.get(id)).filter(Boolean);

  if (orderedDocuments.length !== selectedIds.length) {
    const error = new Error("One or more selected PDFs could not be found.");
    error.status = 404;
    throw error;
  }

  const contentParts = orderedDocuments
    .map((document, index) => ({
      document,
      text: cleanText(document.extractedText),
      heading: document.title || document.originalFileName || `PDF ${index + 1}`
    }))
    .filter((item) => item.text);

  if (!contentParts.length) {
    const error = new Error("Selected PDFs do not contain extracted text for AI generation.");
    error.status = 422;
    throw error;
  }

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

function normalizeSelectedDocumentIds(value) {
  const ids = Array.isArray(value)
    ? value
    : String(value || "").split(",");
  const cleaned = ids.map((id) => String(id || "").trim()).filter(Boolean);
  const unique = [...new Set(cleaned)];

  if (unique.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    const error = new Error("Invalid selected PDF id.");
    error.status = 400;
    throw error;
  }

  return unique;
}

function cleanText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}
