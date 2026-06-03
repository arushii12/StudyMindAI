import mongoose from "mongoose";
import Document from "../models/Document.js";
import Folder from "../models/Folder.js";
import MarkedQuestion from "../models/MarkedQuestion.js";
import Quiz from "../models/Quiz.js";
import SavedSummary from "../models/SavedSummary.js";
import Summary from "../models/Summary.js";
import { isDatabaseConnected } from "../config/db.js";

export async function saveSummaryForReview(user, payload = {}) {
  ensureUserAndDatabase(user);
  const documentId = validateId(payload.documentId, "Invalid document id.");
  const summaryId = payload.summaryId ? validateId(payload.summaryId, "Invalid summary id.") : null;
  const summaryLength = normalizeLength(payload.summaryLength);
  const document = await Document.findOne({ _id: documentId, userId: user.id }).lean();

  if (!document) {
    const error = new Error("Document not found for saved summary.");
    error.status = 404;
    throw error;
  }

  const summary = summaryId
    ? await Summary.findOne({ _id: summaryId, userId: user.id, documentId }).lean()
    : await Summary.findOne({ userId: user.id, documentId }).sort({ updatedAt: -1 }).lean();
  const summaryText = String(
    payload.summaryText || summary?.content?.[summaryLength] || summary?.summaryText || ""
  ).trim();

  if (!summaryText) {
    const error = new Error("No summary text is available to save.");
    error.status = 400;
    throw error;
  }

  const saved = await SavedSummary.findOneAndUpdate(
    {
      userId: user.id,
      documentId,
      summaryLength,
      ...(summary?._id ? { summaryId: summary._id } : {})
    },
    {
      userId: user.id,
      folderId: summary?.folderId || document.folderId || null,
      documentId,
      summaryId: summary?._id || summaryId,
      summaryTitle: payload.summaryTitle || document.title,
      summaryText,
      summaryLength,
      savedAt: new Date()
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return { savedSummary: await mapSavedSummary(saved), message: "Saved to Review Center." };
}

export async function listSavedSummariesForReview(user) {
  ensureUserAndDatabase(user);
  const summaries = await SavedSummary.find({ userId: user.id })
    .sort({ savedAt: -1 })
    .lean();

  return {
    folders: await groupItemsByFolder(summaries, mapSavedSummary),
    summaries: await Promise.all(summaries.map((summary) => mapSavedSummary(summary)))
  };
}

export async function listSavedSummariesForReviewFolder(user, folderId) {
  ensureUserAndDatabase(user);
  const summaries = await SavedSummary.find(buildFolderQuery(user, folderId))
    .sort({ savedAt: -1 })
    .lean();

  return {
    folder: await buildFolderMeta(folderId),
    savedSummaries: await Promise.all(summaries.map((summary) => mapSavedSummary(summary)))
  };
}

export async function removeSavedSummaryForReview(user, id) {
  ensureUserAndDatabase(user);
  validateId(id, "Invalid saved summary id.");
  const result = await SavedSummary.deleteOne({ _id: id, userId: user.id });

  return {
    deletedCount: result.deletedCount || 0,
    message: result.deletedCount ? "Saved summary removed." : "Saved summary not found."
  };
}

export async function markQuestionForReview(user, payload = {}) {
  ensureUserAndDatabase(user);
  const quizId = validateId(payload.quizId, "Invalid quiz id.");
  const questionId = String(payload.questionId || "").trim();

  if (!questionId) {
    const error = new Error("Missing quiz question id.");
    error.status = 400;
    throw error;
  }

  const quiz = await Quiz.findOne({ _id: quizId, userId: user.id }).lean();

  if (!quiz) {
    const error = new Error("Quiz not found for marked question.");
    error.status = 404;
    throw error;
  }

  const question = quiz.questions.find((item) => item._id?.toString?.() === questionId);

  if (!question) {
    const error = new Error("Quiz question not found.");
    error.status = 404;
    throw error;
  }

  const marked = await MarkedQuestion.findOneAndUpdate(
    { userId: user.id, quizId, questionId },
    {
      userId: user.id,
      folderId: quiz.folderId || null,
      documentId: quiz.documentId || null,
      quizId,
      questionId,
      questionText: question.question,
      options: question.options,
      correctAnswer: question.correctAnswer,
      userAnswer: normalizeAnswer(payload.userAnswer),
      explanation: question.explanation,
      markedAt: new Date()
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return { markedQuestion: await mapMarkedQuestion(marked), message: "Question marked for review." };
}

export async function listMarkedQuestionsForReview(user) {
  ensureUserAndDatabase(user);
  const questions = await MarkedQuestion.find({ userId: user.id })
    .sort({ markedAt: -1 })
    .lean();

  return {
    folders: await groupItemsByFolder(questions, mapMarkedQuestion),
    questions: await Promise.all(questions.map((question) => mapMarkedQuestion(question)))
  };
}

export async function listMarkedQuestionsForReviewFolder(user, folderId) {
  ensureUserAndDatabase(user);
  const questions = await MarkedQuestion.find(buildFolderQuery(user, folderId))
    .sort({ markedAt: -1 })
    .lean();

  return {
    folder: await buildFolderMeta(folderId),
    markedQuestions: await Promise.all(questions.map((question) => mapMarkedQuestion(question)))
  };
}

export async function removeMarkedQuestionForReview(user, id) {
  ensureUserAndDatabase(user);
  validateId(id, "Invalid marked question id.");
  const result = await MarkedQuestion.deleteOne({ _id: id, userId: user.id });

  return {
    deletedCount: result.deletedCount || 0,
    message: result.deletedCount ? "Marked question removed." : "Marked question not found."
  };
}

export async function getReviewFoldersForUser(user) {
  ensureUserAndDatabase(user);
  const [summaryData, questionData] = await Promise.all([
    listSavedSummariesForReview(user),
    listMarkedQuestionsForReview(user)
  ]);
  const byKey = new Map();

  [...summaryData.folders, ...questionData.folders].forEach((folder) => {
    const key = folder.folderId || "uncategorized";
    const existing = byKey.get(key) || {
      folderId: folder.folderId,
      folderName: folder.folderName,
      savedSummaryCount: 0,
      markedQuestionCount: 0
    };

    existing.savedSummaryCount += folder.savedSummaries?.length || 0;
    existing.markedQuestionCount += folder.markedQuestions?.length || 0;
    byKey.set(key, existing);
  });

  return { folders: [...byKey.values()] };
}

function ensureUserAndDatabase(user) {
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Review Center requires stored data.");
    error.status = 503;
    throw error;
  }
}

function validateId(id, message) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error(message);
    error.status = 400;
    throw error;
  }

  return id;
}

function normalizeLength(length = "short") {
  return ["short", "medium", "detailed"].includes(length) ? length : "short";
}

function normalizeAnswer(value) {
  const answer = Number(value);
  return Number.isInteger(answer) && answer >= 0 && answer <= 3 ? answer : null;
}

function buildFolderQuery(user, folderId) {
  if (folderId === "uncategorized") {
    return { userId: user.id, folderId: null };
  }

  validateId(folderId, "Invalid folder id.");
  return { userId: user.id, folderId };
}

async function buildFolderMeta(folderId) {
  if (folderId === "uncategorized") {
    return { folderId: null, folderName: "Uncategorized" };
  }

  const folder = await Folder.findById(folderId).select("name").lean();

  return {
    folderId,
    folderName: folder?.name || "Deleted Folder"
  };
}

async function groupItemsByFolder(items, mapper) {
  const folderIds = [...new Set(items.map((item) => item.folderId?.toString()).filter(Boolean))];
  const folders = folderIds.length
    ? await Folder.find({ _id: { $in: folderIds } }).select("name").lean()
    : [];
  const folderNames = new Map(folders.map((folder) => [folder._id.toString(), folder.name]));
  const groups = new Map();

  for (const item of items) {
    const folderId = item.folderId?.toString?.() || null;
    const key = folderId || "uncategorized";
    const group = groups.get(key) || {
      folderId,
      folderName: folderId ? folderNames.get(folderId) || "Deleted Folder" : "Uncategorized",
      savedSummaries: [],
      markedQuestions: []
    };
    const mapped = await mapper(item, folderNames);

    if ("summaryText" in mapped) {
      group.savedSummaries.push(mapped);
    } else {
      group.markedQuestions.push(mapped);
    }

    groups.set(key, group);
  }

  return [...groups.values()].sort((a, b) => a.folderName.localeCompare(b.folderName));
}

async function mapSavedSummary(summary, folderNames = null) {
  const folderName = await resolveFolderName(summary.folderId, folderNames);

  return {
    id: summary._id.toString(),
    folderId: summary.folderId?.toString?.() || null,
    folderName,
    documentId: summary.documentId?.toString?.() || null,
    summaryId: summary.summaryId?.toString?.() || null,
    summaryTitle: summary.summaryTitle,
    summaryText: summary.summaryText,
    summaryLength: summary.summaryLength,
    savedAt: summary.savedAt
  };
}

async function mapMarkedQuestion(question, folderNames = null) {
  const folderName = await resolveFolderName(question.folderId, folderNames);

  return {
    id: question._id.toString(),
    folderId: question.folderId?.toString?.() || null,
    folderName,
    documentId: question.documentId?.toString?.() || null,
    quizId: question.quizId?.toString?.() || null,
    questionId: question.questionId,
    questionText: question.questionText,
    options: question.options,
    correctAnswer: question.correctAnswer,
    userAnswer: question.userAnswer,
    explanation: question.explanation,
    markedAt: question.markedAt
  };
}

async function resolveFolderName(folderId, folderNames) {
  if (!folderId) {
    return "Uncategorized";
  }

  const key = folderId.toString();

  if (folderNames?.has(key)) {
    return folderNames.get(key);
  }

  const folder = await Folder.findById(folderId).select("name").lean();
  return folder?.name || "Deleted Folder";
}
