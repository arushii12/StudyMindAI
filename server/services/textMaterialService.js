// Import Mongoose so text material ids can be validated before queries.
import mongoose from "mongoose";
// Pasted text is stored as a Document with fileType "text".
import Document from "../models/Document.js";
// Text material requires MongoDB persistence.
import { isDatabaseConnected } from "../config/db.js";
// Reuse the normal flashcard generation flow for pasted text.
import { generateFlashcardsForUser } from "./flashcardService.js";
// Reuse the normal quiz generation flow for pasted text.
import { generateQuizForUser } from "./quizService.js";
// Reuse the normal summary generation flow for pasted text.
import { generateSummaryForUser } from "./summaryService.js";

// Maximum pasted text length accepted by the backend.
const MAX_TEXT_LENGTH = 20000;
// Minimum words required so AI can generate meaningful study content.
const MIN_WORDS = 80;

// Called when the user saves pasted study text.
// It creates or updates a text Document that other study flows can reuse.
export async function saveTextMaterialForUser(user, payload = {}) {
  ensureUserAndDatabase(user);
  // Clean title and text before validation or saving.
  const title = cleanTitle(payload.title);
  const text = cleanStudyText(payload.text);

  validateStudyText(text);

  // document is reused when React edits an existing pasted text material.
  let document = null;

  if (payload.documentId) {
    // Load the existing text document only if it belongs to this user.
    document = await findTextMaterial(user.id, payload.documentId);
  }

  if (document) {
    // Update the saved text material in place.
    document.title = title;
    document.displayName = title;
    document.subject = title;
    document.extractedText = text;
    document.fileSize = Buffer.byteLength(text, "utf8");
    document.status = "ready";
    document.sourceType = "text";
    await document.save();
  } else {
    // Store pasted text as a document so summary, quiz, and flashcards can use one pipeline.
    document = await Document.create({
      userId: user.id,
      title,
      displayName: title,
      originalFileName: "",
      storedFileName: "",
      subject: title,
      folderId: null,
      folderName: "",
      fileType: "text",
      sourceType: "text",
      status: "ready",
      summaryGenerated: false,
      extractedText: text,
      pageCount: 0,
      fileSize: Buffer.byteLength(text, "utf8"),
      filePath: "",
      uploadDate: new Date()
    });
  }

  return {
    document: mapTextMaterial(document)
  };
}

// Called when React restores a saved pasted text material.
export async function getTextMaterialForUser(user, documentId) {
  ensureUserAndDatabase(user);
  // Find the text document with user ownership protection.
  const document = await findTextMaterial(user.id, documentId);

  if (!document) {
    const error = new Error("Text study material not found.");
    error.status = 404;
    throw error;
  }

  return {
    document: mapTextMaterial(document)
  };
}

// Called when the user asks pasted text to generate summary, quiz, or flashcards.
// It saves the text first, then forwards to the selected generation service.
export async function generateFromTextForUser(user, payload = {}) {
  // Normalize the requested action before doing generation work.
  const action = normalizeAction(payload.action);
  // Save latest text so AI uses the current editor content.
  const saved = await saveTextMaterialForUser(user, payload);
  const documentId = saved.document.id;

  if (action === "summary") {
    // Forward to summaryService using the saved text document id.
    return {
      action,
      result: await generateSummaryForUser(user, {
        documentId,
        length: "short",
        markStudied: false
      })
    };
  }

  if (action === "quiz") {
    // Forward to quizService using the saved text document id.
    return {
      action,
      result: await generateQuizForUser(user, {
        documentId,
        questionCount: 8
      })
    };
  }

  return {
    // Default valid action is flashcards, forwarded to flashcardService.
    action,
    result: await generateFlashcardsForUser(user, {
      documentId,
      cardCount: 12
    })
  };
}

// Shared guard for pasted text operations.
function ensureUserAndDatabase(user) {
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Text study materials require persistence.");
    error.status = 503;
    throw error;
  }
}

// Clean the title shown in Library and generated study content.
function cleanTitle(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "Pasted Study Text";
}

// Preserve pasted text content while normalizing line endings.
function cleanStudyText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .trim();
}

// Validate which generation flow React requested.
function normalizeAction(value) {
  const action = String(value || "").toLowerCase();

  if (!["summary", "quiz", "flashcards"].includes(action)) {
    const error = new Error("Choose a valid generation action.");
    error.status = 400;
    throw error;
  }

  return action;
}

// Validate pasted text before storing or sending it to AI.
function validateStudyText(text) {
  if (!text) {
    const error = new Error("Please paste study material first.");
    error.status = 400;
    throw error;
  }

  if (text.length > MAX_TEXT_LENGTH) {
    const error = new Error(`Study text must be ${MAX_TEXT_LENGTH.toLocaleString()} characters or fewer.`);
    error.status = 400;
    throw error;
  }

  if (countWords(text) < MIN_WORDS) {
    const error = new Error("Please enter more study content to generate meaningful results.");
    error.status = 422;
    throw error;
  }
}

// Find an existing text material document owned by the user.
async function findTextMaterial(userId, documentId) {
  if (!documentId) {
    return null;
  }

  // Validate documentId before querying MongoDB.
  if (!mongoose.Types.ObjectId.isValid(documentId)) {
    const error = new Error("Invalid text study material id.");
    error.status = 400;
    throw error;
  }

  // Only fileType "text" documents are valid for this flow.
  const document = await Document.findOne({
    _id: documentId,
    userId,
    fileType: "text",
    status: { $ne: "archived" }
  });

  if (!document) {
    const error = new Error("Text study material not found.");
    error.status = 404;
    throw error;
  }

  return document;
}

// Convert a text Document into the response shape used by React.
function mapTextMaterial(document) {
  return {
    id: document._id.toString(),
    title: document.displayName || document.title || "Pasted Study Text",
    content: document.extractedText || "",
    text: document.extractedText || "",
    type: "text",
    sourceType: "text",
    fileType: "text",
    createdAt: document.createdAt || document.uploadDate,
    updatedAt: document.updatedAt
  };
}

// Count words for minimum-content validation.
function countWords(text) {
  return String(text || "").split(/\s+/).filter(Boolean).length;
}
