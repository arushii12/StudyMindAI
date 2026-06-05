import mongoose from "mongoose";
import Document from "../models/Document.js";
import { isDatabaseConnected } from "../config/db.js";
import { generateFlashcardsForUser } from "./flashcardService.js";
import { generateQuizForUser } from "./quizService.js";
import { generateSummaryForUser } from "./summaryService.js";

const MAX_TEXT_LENGTH = 20000;
const MIN_WORDS = 80;

export async function saveTextMaterialForUser(user, payload = {}) {
  ensureUserAndDatabase(user);
  const title = cleanTitle(payload.title);
  const text = cleanStudyText(payload.text);

  validateStudyText(text);

  let document = null;

  if (payload.documentId) {
    document = await findTextMaterial(user.id, payload.documentId);
  }

  if (document) {
    document.title = title;
    document.displayName = title;
    document.subject = title;
    document.extractedText = text;
    document.fileSize = Buffer.byteLength(text, "utf8");
    document.status = "ready";
    document.sourceType = "text";
    await document.save();
  } else {
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

export async function getTextMaterialForUser(user, documentId) {
  ensureUserAndDatabase(user);
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

export async function generateFromTextForUser(user, payload = {}) {
  const action = normalizeAction(payload.action);
  const saved = await saveTextMaterialForUser(user, payload);
  const documentId = saved.document.id;

  if (action === "summary") {
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
    return {
      action,
      result: await generateQuizForUser(user, {
        documentId,
        questionCount: 8
      })
    };
  }

  return {
    action,
    result: await generateFlashcardsForUser(user, {
      documentId,
      cardCount: 12
    })
  };
}

function ensureUserAndDatabase(user) {
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Text study materials require persistence.");
    error.status = 503;
    throw error;
  }
}

function cleanTitle(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "Pasted Study Text";
}

function cleanStudyText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function normalizeAction(value) {
  const action = String(value || "").toLowerCase();

  if (!["summary", "quiz", "flashcards"].includes(action)) {
    const error = new Error("Choose a valid generation action.");
    error.status = 400;
    throw error;
  }

  return action;
}

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

async function findTextMaterial(userId, documentId) {
  if (!documentId) {
    return null;
  }

  if (!mongoose.Types.ObjectId.isValid(documentId)) {
    const error = new Error("Invalid text study material id.");
    error.status = 400;
    throw error;
  }

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

function countWords(text) {
  return String(text || "").split(/\s+/).filter(Boolean).length;
}
