// Import async filesystem helpers for reading PDFs and deleting uploaded files.
import fs from "fs/promises";
// Import sync filesystem helper for checking whether a stored PDF still exists.
import fsSync from "fs";
// Import path helpers to build titles from uploaded file names.
import path from "path";
// Import Mongoose so ids can be validated before database queries.
import mongoose from "mongoose";
// PDFParse extracts readable text from uploaded PDF files.
import { PDFParse } from "pdf-parse";
// Document stores uploaded PDFs and extracted text.
import Document from "../models/Document.js";
// The following models hold generated study data linked to documents.
import Flashcard from "../models/Flashcard.js";
import FlashcardProgress from "../models/FlashcardProgress.js";
import FlashcardSet from "../models/FlashcardSet.js";
import Folder from "../models/Folder.js";
import MarkedQuestion from "../models/MarkedQuestion.js";
import Quiz from "../models/Quiz.js";
import QuizAttempt from "../models/QuizAttempt.js";
import SavedSummary from "../models/SavedSummary.js";
import Summary from "../models/Summary.js";
// Upload flow generates the first summary after saving the document.
import { generateSummaryForUser } from "./summaryService.js";
// Used to return controlled errors when MongoDB is unavailable.
import { isDatabaseConnected } from "../config/db.js";
// Folder service resolves or creates the target folder for an upload.
import { resolveFolderForUpload } from "./folderService.js";

// Called after Multer saves a PDF to disk.
// It extracts text, saves the Document, generates a summary, and cleans up on failure.
export async function uploadDocumentForUser(user, file, payload = {}) {
  // The route should provide req.file; without it there is no PDF to process.
  if (!file) {
    const error = new Error("Please choose a PDF file to upload.");
    error.status = 400;
    throw error;
  }

  // extracted stores text and page count from the PDF parser.
  let extracted;

  try {
    // Read the uploaded PDF before creating the MongoDB document.
    extracted = await extractPdfText(file.path);
  } catch (error) {
    // If parsing fails, remove the temporary upload so storage stays clean.
    await removeFile(file.path);
    error.status = 422;
    throw error;
  }

  // Do not keep uploaded files if MongoDB cannot store their metadata.
  if (!user?.id || !isDatabaseConnected()) {
    await removeFile(file.path);
    const error = new Error("MongoDB is not connected. Configure MONGO_URI before uploading documents.");
    error.status = 503;
    throw error;
  }

  let document;

  try {
    // Resolve the target folder before saving folderId and subject.
    const folder = await resolveFolderForUpload(user, payload);
    const folderId = folder?._id || null;
    // Prevent duplicate PDFs inside the same folder for this user.
    const duplicate = await findDuplicateUpload(user.id, folderId, file);

    if (duplicate) {
      const error = new Error("This PDF already exists in the selected folder.");
      error.status = 409;
      throw error;
    }

    // Build a clean title from React input or the original file name.
    const title = cleanTitle(payload.title || path.basename(file.originalname, path.extname(file.originalname)));
    const subject = folder?.name || cleanTitle(payload.subject || inferSubject(title));

    // Store the uploaded document and extracted text in MongoDB.
    document = await Document.create({
      userId: user.id,
      title,
      displayName: title,
      originalFileName: file.originalname,
      storedFileName: file.filename,
      subject,
      folderId,
      folderName: folder?.name || "",
      fileType: "pdf",
      sourceType: "pdf",
      status: "ready",
      summaryGenerated: false,
      extractedText: extracted.text,
      pageCount: extracted.pageCount,
      fileSize: file.size,
      filePath: file.path,
      uploadDate: new Date()
    });

    console.debug("[PDF Upload]", {
      documentId: document._id.toString(),
      originalFileName: document.originalFileName,
      storedFileName: document.storedFileName,
      filePath: document.filePath,
      pdfUrl: buildPdfUrl(document._id),
      fileUrl: buildStaticFileUrl(document.storedFileName)
    });

    // Generate the first summary so the Summary page has content immediately.
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
  } catch (error) {
    // If anything fails after document creation, remove linked generated data too.
    if (document?._id) {
      try {
        await deleteDocumentLinkedData(user.id, [document._id]);
      } catch (cleanupError) {
        console.error("[PDF Upload Cleanup]", cleanupError);
      }

      try {
        await Document.deleteOne({ _id: document._id, userId: user.id });
      } catch (cleanupError) {
        console.error("[PDF Upload Record Cleanup]", cleanupError);
      }
    }

    // Always remove the uploaded file when the upload flow fails.
    await removeFile(file.path);
    throw error;
  }
}

// Called when the Library page loads.
// It returns only documents owned by the current user.
export async function listDocumentsForUser(user, filters = {}) {
  if (!user?.id || !isDatabaseConnected()) {
    return { documents: [], meta: { hasData: false } };
  }

  // userId in the query prevents one user from seeing another user's documents.
  const query = { userId: user.id, status: { $ne: "archived" } };

  if (filters.folderId) {
    // Validate folderId before adding it to the MongoDB query.
    if (!mongoose.Types.ObjectId.isValid(filters.folderId)) {
      const error = new Error("Invalid folder id.");
      error.status = 400;
      throw error;
    }

    query.folderId = filters.folderId;
  }

  // Load newest documents first for the Library view.
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

// Called when the user moves one or more PDFs to a folder.
export async function moveDocumentsForUser(user, documentIds = [], folderId) {
  // Moving documents requires an authenticated user and MongoDB.
  ensureUserAndDatabase(user, "MongoDB is not connected. Configure MONGO_URI before moving documents.");
  // Normalize ids from single or bulk selection.
  const ids = normalizeDocumentIds(documentIds);

  if (!ids.length) {
    const error = new Error("Select at least one PDF to move.");
    error.status = 400;
    throw error;
  }

  // Validate destination folder id before querying.
  validateObjectId(folderId, "Invalid folder id.");

  // Find the destination folder only if it belongs to this user.
  const folder = await Folder.findOne({ _id: folderId, userId: user.id }).lean();

  if (!folder) {
    const error = new Error("Destination folder not found.");
    error.status = 404;
    throw error;
  }

  // Move only documents owned by this user and not archived.
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

  // Touch the folder so sorting by recent activity stays correct.
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

// Called when the user renames a PDF in the Library.
export async function renameDocumentForUser(user, documentId, payload = {}) {
  ensureUserAndDatabase(user, "MongoDB is not connected. Configure MONGO_URI before renaming PDFs.");
  validateObjectId(documentId, "Invalid document id.");

  // Accept the different field names React may send for the new display name.
  const displayName = cleanDisplayName(payload.displayName ?? payload.title ?? payload.fileName);

  if (!displayName) {
    const error = new Error("File name cannot be empty.");
    error.status = 400;
    throw error;
  }

  if (displayName.length > 100) {
    const error = new Error("File name must be 100 characters or fewer.");
    error.status = 400;
    throw error;
  }

  // Rename the document only if it belongs to this user.
  const document = await Document.findOneAndUpdate(
    {
      _id: documentId,
      userId: user.id,
      status: { $ne: "archived" }
    },
    {
      displayName,
      title: displayName,
      updatedAt: new Date()
    },
    { new: true }
  );

  if (!document) {
    const error = new Error("PDF not found.");
    error.status = 404;
    throw error;
  }

  // Keep related generated cards, quizzes, and saved summaries aligned with the new name.
  await Promise.all([
    SavedSummary.updateMany(
      { userId: user.id, documentId: document._id },
      { summaryTitle: displayName }
    ),
    Quiz.updateMany(
      { userId: user.id, documentId: document._id, generationType: { $ne: "selected" } },
      { title: `${displayName} Quiz` }
    ),
    FlashcardSet.updateMany(
      { userId: user.id, documentId: document._id, generationType: { $ne: "selected" } },
      { title: `${displayName} Flashcards` }
    )
  ]);

  if (document.folderId) {
    await Folder.updateOne({ _id: document.folderId, userId: user.id }, { updatedAt: new Date() });
  }

  return {
    document: mapDocument(document.toObject()),
    message: "PDF renamed."
  };
}

// Called when the user deletes selected PDFs.
// It deletes documents, generated study content, review items, and stored files.
export async function deleteDocumentsForUser(user, documentIds = []) {
  ensureUserAndDatabase(user, "MongoDB is not connected. Configure MONGO_URI before deleting documents.");
  const ids = normalizeDocumentIds(documentIds);

  if (!ids.length) {
    const error = new Error("Select at least one PDF to delete.");
    error.status = 400;
    throw error;
  }

  // Load matching documents first so we know exactly which owned files to delete.
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

  // Delete the document records for this user.
  await Document.deleteMany({
    _id: { $in: documents.map((document) => document._id) },
    userId: user.id
  });

  // Delete summaries, quizzes, flashcards, attempts, and review records linked to them.
  await deleteDocumentLinkedData(user.id, documents.map((document) => document._id));

  // Remove the actual PDF files from local upload storage.
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

// Called when React opens or downloads a PDF.
// It returns a file path only after checking document ownership.
export async function getDocumentPdfForUser(user, documentId) {
  ensureUserAndDatabase(user, "MongoDB is not connected. Configure MONGO_URI before viewing PDFs.");
  validateObjectId(documentId, "Invalid document id.");

  // Find the PDF only if it belongs to this user and is not archived.
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

  // Confirm the file still exists before the controller streams it.
  if (!document.filePath || !fsSync.existsSync(document.filePath)) {
    const error = new Error("The original PDF file is missing from storage.");
    error.status = 404;
    throw error;
  }

  console.debug("[PDF View]", {
    documentId: document._id.toString(),
    originalFileName: document.originalFileName,
    storedFileName: document.storedFileName,
    filePath: document.filePath,
    pdfUrl: buildPdfUrl(document._id),
    fileUrl: buildStaticFileUrl(document.storedFileName)
  });

  return {
    filePath: document.filePath,
    fileName: `${getDocumentDisplayName(document)}.pdf`
  };
}

// Extract readable text and page count from a PDF file on disk.
async function extractPdfText(filePath) {
  const buffer = await fs.readFile(filePath);
  const parser = new PDFParse({ data: buffer });

  try {
    const data = await parser.getText();
    const text = data.text.replace(/\s+/g, " ").trim();

    // Reject scanned or unreadable PDFs with too little extracted text.
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

// Remove a file from upload storage.
async function removeFile(filePath) {
  if (!filePath) {
    return;
  }

  try {
    await fs.unlink(filePath);
  } catch {
    // If cleanup fails, keep reporting the original upload problem.
    // That original error is what the user actually needs to fix.
  }
}

// Check whether the same PDF name and size already exists in this folder.
async function findDuplicateUpload(userId, folderId, file) {
  const candidates = await Document.find({
    userId,
    folderId,
    fileSize: Number(file.size || 0),
    status: { $ne: "archived" }
  })
    .select("originalFileName")
    .lean();
  const uploadedName = normalizeFileName(file.originalname);

  return candidates.find((candidate) => normalizeFileName(candidate.originalFileName) === uploadedName) || null;
}

// Normalize file names before duplicate comparison.
function normalizeFileName(fileName) {
  return String(fileName || "").trim().toLocaleLowerCase();
}

// Remove all generated study data connected to deleted documents.
async function deleteDocumentLinkedData(userId, documentIds) {
  // Progress records point to flashcard set ids, so collect them before deleting sets.
  const flashcardSets = await FlashcardSet.find({
    userId,
    documentId: { $in: documentIds }
  })
    .select("_id")
    .lean();
  const flashcardSetIds = flashcardSets.map((set) => set._id);

  // Delete every dependent collection in parallel.
  await Promise.all([
    Summary.deleteMany({ userId, documentId: { $in: documentIds } }),
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

// Shared guard for document operations that require auth and MongoDB.
function ensureUserAndDatabase(user, message) {
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error(message);
    error.status = 503;
    throw error;
  }
}

// Validate MongoDB ObjectIds before using them in queries.
function validateObjectId(id, message) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error(message);
    error.status = 400;
    throw error;
  }
}

// Normalize single or multiple document ids from React bulk actions.
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

// Convert a Document record into the Library response shape.
function mapDocument(document) {
  const documentId = document._id.toString();
  const displayName = getDocumentDisplayName(document);

  return {
    id: documentId,
    documentId,
    title: displayName,
    displayName,
    fileName: displayName,
    subject: document.subject,
    folderId: document.folderId?.toString?.() || null,
    folderName: document.folderName || "",
    originalFileName: document.originalFileName,
    storedFileName: document.storedFileName,
    fileType: document.fileType,
    sourceType: document.sourceType || document.fileType,
    pageCount: document.pageCount,
    fileSize: document.fileSize,
    filePath: document.filePath,
    pdfUrl: buildPdfUrl(documentId),
    fileUrl: buildStaticFileUrl(document.storedFileName),
    uploadDate: document.uploadDate || document.createdAt,
    summaryStatus: document.summaryGenerated ? "Summary Generated" : "Summary Pending",
    status: document.status
  };
}

// Choose the name shown to the learner instead of the stored filename.
function getDocumentDisplayName(document) {
  return cleanDisplayName(document.displayName || document.title || stripPdfExtension(document.originalFileName)) || "Uploaded Document";
}

// Build the protected PDF route used by the frontend viewer.
function buildPdfUrl(documentId) {
  return `/api/documents/${documentId}/pdf`;
}

// Build the static upload URL used only where direct file access is acceptable.
function buildStaticFileUrl(storedFileName) {
  return storedFileName ? `/uploads/${encodeURIComponent(storedFileName)}` : "";
}

// Clean titles before saving them to MongoDB.
function cleanTitle(value) {
  return String(value || "Uploaded Document").trim().slice(0, 120) || "Uploaded Document";
}

// Clean display names and remove the .pdf extension.
function cleanDisplayName(value) {
  return stripPdfExtension(value)
    .replace(/\s+/g, " ")
    .trim();
}

// Remove a trailing .pdf extension from a file name.
function stripPdfExtension(value) {
  return String(value || "").replace(/\.pdf$/i, "");
}

// Guess a subject from the file title when the user did not choose a folder.
function inferSubject(title) {
  return title
    .replace(/[-_]+/g, " ")
    .replace(/\b(unit|chapter|notes|pdf|document)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim() || "General Studies";
}
