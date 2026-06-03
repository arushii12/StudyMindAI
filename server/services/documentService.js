import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import mongoose from "mongoose";
import { PDFParse } from "pdf-parse";
import Document from "../models/Document.js";
import Flashcard from "../models/Flashcard.js";
import FlashcardProgress from "../models/FlashcardProgress.js";
import FlashcardSet from "../models/FlashcardSet.js";
import Folder from "../models/Folder.js";
import ImportantQuestion from "../models/ImportantQuestion.js";
import MarkedQuestion from "../models/MarkedQuestion.js";
import Quiz from "../models/Quiz.js";
import QuizAttempt from "../models/QuizAttempt.js";
import SavedSummary from "../models/SavedSummary.js";
import Summary from "../models/Summary.js";
import { generateSummaryForUser } from "./summaryService.js";
import { isDatabaseConnected } from "../config/db.js";
import { resolveFolderForUpload } from "./folderService.js";

export async function uploadDocumentForUser(user, file, payload = {}) {
  if (!file) {
    const error = new Error("Please choose a PDF file to upload.");
    error.status = 400;
    throw error;
  }

  let extracted;

  try {
    extracted = await extractPdfText(file.path);
  } catch (error) {
    await removeFile(file.path);
    error.status = 422;
    throw error;
  }

  if (!user?.id || !isDatabaseConnected()) {
    await removeFile(file.path);
    const error = new Error("MongoDB is not connected. Configure MONGO_URI before uploading documents.");
    error.status = 503;
    throw error;
  }

  const folder = await resolveFolderForUpload(user, payload);
  const title = cleanTitle(payload.title || path.basename(file.originalname, path.extname(file.originalname)));
  const subject = folder?.name || cleanTitle(payload.subject || inferSubject(title));

  const document = await Document.create({
    userId: user.id,
    title,
    originalFileName: file.originalname,
    storedFileName: file.filename,
    subject,
    folderId: folder?._id || null,
    folderName: folder?.name || "",
    fileType: "pdf",
    status: "ready",
    summaryGenerated: false,
    extractedText: extracted.text,
    pageCount: extracted.pageCount,
    fileSize: file.size,
    filePath: file.path,
    uploadDate: new Date()
  });

  const summary = await generateSummaryForUser(user, {
    documentId: document._id.toString(),
    length: payload.length || "short",
    markStudied: false
  });

  return {
    document: mapDocument(document),
    summary,
    message: "PDF uploaded, text extracted, and summary generated."
  };
}

export async function listDocumentsForUser(user, filters = {}) {
  if (!user?.id || !isDatabaseConnected()) {
    return { documents: [], meta: { hasData: false } };
  }

  const query = { userId: user.id, status: { $ne: "archived" } };

  if (filters.folderId) {
    if (!mongoose.Types.ObjectId.isValid(filters.folderId)) {
      const error = new Error("Invalid folder id.");
      error.status = 400;
      throw error;
    }

    query.folderId = filters.folderId;
  }

  const documents = await Document.find(query)
    .sort({ uploadDate: -1, updatedAt: -1 })
    .lean();

  return {
    documents: documents.map(mapDocument),
    meta: {
      hasData: documents.length > 0
    }
  };
}

export async function moveDocumentsForUser(user, documentIds = [], folderId) {
  ensureUserAndDatabase(user, "MongoDB is not connected. Configure MONGO_URI before moving documents.");
  const ids = normalizeDocumentIds(documentIds);

  if (!ids.length) {
    const error = new Error("Select at least one PDF to move.");
    error.status = 400;
    throw error;
  }

  validateObjectId(folderId, "Invalid folder id.");

  const folder = await Folder.findOne({ _id: folderId, userId: user.id }).lean();

  if (!folder) {
    const error = new Error("Destination folder not found.");
    error.status = 404;
    throw error;
  }

  const result = await Document.updateMany(
    {
      _id: { $in: ids },
      userId: user.id,
      status: { $ne: "archived" }
    },
    {
      folderId: folder._id,
      folderName: folder.name,
      subject: folder.name
    }
  );

  await Folder.updateOne({ _id: folder._id }, { updatedAt: new Date() });

  return {
    movedCount: result.modifiedCount || 0,
    folder: {
      id: folder._id.toString(),
      name: folder.name
    },
    message: `${result.modifiedCount || 0} PDF${(result.modifiedCount || 0) === 1 ? "" : "s"} moved.`
  };
}

export async function deleteDocumentsForUser(user, documentIds = []) {
  ensureUserAndDatabase(user, "MongoDB is not connected. Configure MONGO_URI before deleting documents.");
  const ids = normalizeDocumentIds(documentIds);

  if (!ids.length) {
    const error = new Error("Select at least one PDF to delete.");
    error.status = 400;
    throw error;
  }

  const documents = await Document.find({
    _id: { $in: ids },
    userId: user.id,
    status: { $ne: "archived" }
  }).lean();

  if (!documents.length) {
    const error = new Error("No matching PDFs found.");
    error.status = 404;
    throw error;
  }

  await Document.deleteMany({
    _id: { $in: documents.map((document) => document._id) },
    userId: user.id
  });

  await deleteDocumentLinkedData(user.id, documents.map((document) => document._id));

  await Promise.all(documents.map((document) => removeFile(document.filePath)));

  const affectedFolderIds = [
    ...new Set(documents.map((document) => document.folderId?.toString()).filter(Boolean))
  ];

  if (affectedFolderIds.length) {
    await Folder.updateMany(
      { _id: { $in: affectedFolderIds } },
      { updatedAt: new Date() }
    );
  }

  return {
    deletedCount: documents.length,
    message: `${documents.length} PDF${documents.length === 1 ? "" : "s"} deleted.`
  };
}

export async function getDocumentPdfForUser(user, documentId) {
  ensureUserAndDatabase(user, "MongoDB is not connected. Configure MONGO_URI before viewing PDFs.");
  validateObjectId(documentId, "Invalid document id.");

  const document = await Document.findOne({
    _id: documentId,
    userId: user.id,
    status: { $ne: "archived" }
  }).lean();

  if (!document) {
    const error = new Error("PDF not found.");
    error.status = 404;
    throw error;
  }

  if (!document.filePath || !fsSync.existsSync(document.filePath)) {
    const error = new Error("The original PDF file is missing from storage.");
    error.status = 404;
    throw error;
  }

  return {
    filePath: document.filePath,
    fileName: document.originalFileName || `${document.title || "StudyMind PDF"}.pdf`
  };
}

async function extractPdfText(filePath) {
  const buffer = await fs.readFile(filePath);
  const parser = new PDFParse({ data: buffer });

  try {
    const data = await parser.getText();
    const text = data.text.replace(/\s+/g, " ").trim();

    if (!text || text.length < 40) {
      throw new Error("Could not extract enough readable text from this PDF.");
    }

    return {
      text,
      pageCount: data.total || 0
    };
  } finally {
    await parser.destroy();
  }
}

async function removeFile(filePath) {
  if (!filePath) {
    return;
  }

  try {
    await fs.unlink(filePath);
  } catch {
    // Ignore cleanup failures; the upload request should report the original error.
  }
}

async function deleteDocumentLinkedData(userId, documentIds) {
  const flashcardSets = await FlashcardSet.find({
    userId,
    documentId: { $in: documentIds }
  })
    .select("_id")
    .lean();
  const flashcardSetIds = flashcardSets.map((set) => set._id);

  await Promise.all([
    Summary.deleteMany({ userId, documentId: { $in: documentIds } }),
    ImportantQuestion.deleteMany({ userId, documentId: { $in: documentIds } }),
    SavedSummary.deleteMany({ userId, documentId: { $in: documentIds } }),
    Quiz.deleteMany({ userId, documentId: { $in: documentIds } }),
    QuizAttempt.deleteMany({ userId, documentId: { $in: documentIds } }),
    MarkedQuestion.deleteMany({ userId, documentId: { $in: documentIds } }),
    Flashcard.deleteMany({ userId, documentId: { $in: documentIds } }),
    FlashcardSet.deleteMany({ userId, documentId: { $in: documentIds } }),
    flashcardSetIds.length
      ? FlashcardProgress.deleteMany({ userId, flashcardSetId: { $in: flashcardSetIds } })
      : Promise.resolve()
  ]);
}

function ensureUserAndDatabase(user, message) {
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error(message);
    error.status = 503;
    throw error;
  }
}

function validateObjectId(id, message) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error(message);
    error.status = 400;
    throw error;
  }
}

function normalizeDocumentIds(documentIds) {
  const values = Array.isArray(documentIds) ? documentIds : [documentIds];
  const validIds = values
    .map((id) => String(id || "").trim())
    .filter(Boolean);

  const hasInvalidId = validIds.some((id) => !mongoose.Types.ObjectId.isValid(id));

  if (hasInvalidId) {
    const error = new Error("Invalid document id.");
    error.status = 400;
    throw error;
  }

  return validIds;
}

function mapDocument(document) {
  return {
    id: document._id.toString(),
    title: document.title,
    subject: document.subject,
    folderId: document.folderId?.toString?.() || null,
    folderName: document.folderName || "",
    originalFileName: document.originalFileName,
    storedFileName: document.storedFileName,
    fileType: document.fileType,
    pageCount: document.pageCount,
    fileSize: document.fileSize,
    filePath: document.filePath,
    uploadDate: document.uploadDate || document.createdAt,
    summaryStatus: document.summaryGenerated ? "Summary Generated" : "Summary Pending",
    status: document.status
  };
}

function cleanTitle(value) {
  return String(value || "Uploaded Document").trim().slice(0, 120) || "Uploaded Document";
}

function inferSubject(title) {
  return title
    .replace(/[-_]+/g, " ")
    .replace(/\b(unit|chapter|notes|pdf|document)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim() || "General Studies";
}
