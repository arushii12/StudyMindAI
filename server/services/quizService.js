import mongoose from "mongoose";
import Document from "../models/Document.js";
import Quiz from "../models/Quiz.js";
import QuizAttempt from "../models/QuizAttempt.js";
import Summary from "../models/Summary.js";
import { generateQuiz, generateQuizPerformanceInsight, getActiveAiModelName } from "./aiService.js";
import { isDatabaseConnected } from "../config/db.js";
import { buildSelectedPdfSource } from "./selectedPdfSourceService.js";

const QUESTION_MIN = 8;
const QUESTION_MAX = 15;
const DEFAULT_QUESTION_COUNT = 8;

export async function getQuizForUser(user, options = {}) {
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Quizzes require stored documents.");
    error.status = 503;
    throw error;
  }

  const document = await findSelectedDocument(user.id, options.documentId);

  if (!document) {
    const error = new Error("No uploaded document found for quiz generation.");
    error.status = 404;
    throw error;
  }

  const quiz = await Quiz.findOne({ userId: user.id, documentId: document._id })
    .sort({ generatedAt: -1, updatedAt: -1 })
    .lean();

  return {
    document: mapDocument(document),
    quiz: quiz ? mapQuiz(quiz) : null,
    meta: {
      hasQuiz: Boolean(quiz),
      reused: Boolean(quiz)
    }
  };
}

export async function generateQuizForUser(user, payload = {}) {
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Configure MONGO_URI before generating quizzes.");
    error.status = 503;
    throw error;
  }

  const selectedSource = await buildSelectedPdfSource(user, payload);
  const document = selectedSource?.primaryDocument || await findSelectedDocument(user.id, payload.documentId);

  if (!document) {
    const error = new Error("No uploaded document found for quiz generation.");
    error.status = 404;
    throw error;
  }

  const source = selectedSource || await getQuizSource(user.id, document);
  const questionCount = normalizeQuestionCount(payload.questionCount);
  const generated = await generateQuiz(source.text, {
    documentTitle: source.title || getDocumentDisplayName(document),
    subject: source.subject || document.subject,
    questionCount,
    scope: source.scope || "single-document"
  });
  const validQuestions = validateQuestions(generated.questions);

  if (validQuestions.length < QUESTION_MIN) {
    const error = new Error("AI returned too few valid quiz questions. Please regenerate.");
    error.status = 422;
    throw error;
  }

  const quiz = await Quiz.create({
    userId: user.id,
    documentId: document._id,
    folderId: source.folderId || document.folderId || null,
    selectedDocumentIds: source.selectedDocumentIds || [document._id],
    generationType: selectedSource ? "selected" : "single",
    title: selectedSource ? `${source.title} Quiz` : `${getDocumentDisplayName(document)} Quiz`,
    subject: source.subject || document.subject,
    topic: source.subject || document.subject,
    questionCount: validQuestions.length,
    source: source.type,
    aiModel: getActiveAiModelName(),
    questions: validQuestions,
    generatedAt: new Date()
  });

  return {
    document: mapDocument(document),
    quiz: mapQuiz(quiz.toObject()),
    meta: {
      hasQuiz: true,
      reused: false
    }
  };
}

export async function submitQuizAttemptForUser(user, quizId, payload = {}) {
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Quiz attempts require persistence.");
    error.status = 503;
    throw error;
  }

  if (!mongoose.Types.ObjectId.isValid(quizId)) {
    const error = new Error("Invalid quiz id.");
    error.status = 400;
    throw error;
  }

  const quiz = await Quiz.findOne({ _id: quizId, userId: user.id }).lean();

  if (!quiz) {
    const error = new Error("Quiz not found.");
    error.status = 404;
    throw error;
  }

  const answers = Array.isArray(payload.answers) ? payload.answers : [];

  if (answers.length !== quiz.questions.length) {
    const error = new Error("Answer count must match quiz question count.");
    error.status = 400;
    throw error;
  }

  const hasAnsweredQuestion = answers.some((answer) => {
    const selectedAnswer = Number(answer);
    return Number.isInteger(selectedAnswer) && selectedAnswer >= 0 && selectedAnswer < 4;
  });

  if (!hasAnsweredQuestion) {
    const error = new Error("Please answer at least one question before submitting.");
    error.status = 400;
    throw error;
  }

  const score = quiz.questions.reduce((total, question, index) => {
    return total + (Number(answers[index]) === question.correctAnswer ? 1 : 0);
  }, 0);
  const attempt = await QuizAttempt.create({
    userId: user.id,
    quizId: quiz._id,
    documentId: quiz.documentId,
    subject: quiz.subject,
    topic: quiz.topic,
    score,
    totalQuestions: quiz.questions.length,
    timeSpentMinutes: Math.max(0, Number(payload.timeSpentMinutes || 0)),
    completedAt: new Date()
  });

  return {
    attempt: {
      id: attempt._id.toString(),
      quizId: quiz._id.toString(),
      score,
      totalQuestions: quiz.questions.length,
      percentage: Math.round((score / quiz.questions.length) * 100),
      completedAt: attempt.completedAt
    }
  };
}

export async function generateQuizInsightForUser(user, quizId, payload = {}) {
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Quiz insights require stored quizzes.");
    error.status = 503;
    throw error;
  }

  if (!mongoose.Types.ObjectId.isValid(quizId)) {
    const error = new Error("Invalid quiz id.");
    error.status = 400;
    throw error;
  }

  const quiz = await Quiz.findOne({ _id: quizId, userId: user.id }).lean();

  if (!quiz) {
    const error = new Error("Quiz not found.");
    error.status = 404;
    throw error;
  }

  const generated = await generateQuizPerformanceInsight({
    quizTitle: payload.quizTitle || quiz.title,
    scorePercentage: payload.scorePercentage,
    correctCount: payload.correctCount,
    incorrectCount: payload.incorrectCount,
    unansweredCount: payload.unansweredCount,
    totalQuestions: payload.totalQuestions || quiz.questions.length,
    answers: normalizeInsightAnswers(payload.answers)
  });
  const insight = String(generated?.insight || "").replace(/\s+/g, " ").trim();

  if (!insight) {
    const error = new Error("AI did not return a quiz performance insight.");
    error.status = 422;
    throw error;
  }

  return { insight };
}

export async function deleteQuizForUser(user, quizId) {
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Quizzes require stored documents.");
    error.status = 503;
    throw error;
  }

  if (!mongoose.Types.ObjectId.isValid(quizId)) {
    const error = new Error("Invalid quiz id.");
    error.status = 400;
    throw error;
  }

  const quiz = await Quiz.findOneAndDelete({ _id: quizId, userId: user.id }).lean();

  if (!quiz) {
    const error = new Error("Quiz not found.");
    error.status = 404;
    throw error;
  }

  await QuizAttempt.deleteMany({ userId: user.id, quizId });

  return {
    deletedQuizId: quizId,
    message: "Quiz deleted successfully."
  };
}

function normalizeInsightAnswers(answers) {
  if (!Array.isArray(answers)) {
    return [];
  }

  return answers.slice(0, QUESTION_MAX).map((answer) => ({
    questionText: String(answer?.questionText || "").trim(),
    status: String(answer?.status || "").trim(),
    selectedAnswer: Number.isInteger(answer?.selectedAnswer) ? answer.selectedAnswer : null,
    correctAnswer: Number.isInteger(answer?.correctAnswer) ? answer.correctAnswer : null,
    options: Array.isArray(answer?.options) ? answer.options.map((option) => String(option || "").trim()).slice(0, 6) : [],
    selectedAnswerText: String(answer?.selectedAnswerText || "").trim(),
    correctAnswerText: String(answer?.correctAnswerText || "").trim(),
    explanation: String(answer?.explanation || "").trim(),
    topic: String(answer?.topic || answer?.category || "").trim()
  }));
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

async function getQuizSource(userId, document) {
  if (document.fileType === "text" && countWords(document.extractedText) >= 80) {
    return {
      type: "document",
      text: document.extractedText
    };
  }

  const summary = await Summary.findOne({ userId, documentId: document._id })
    .sort({ generatedAt: -1, updatedAt: -1 })
    .lean();

  const summaryText = [
    summary?.content?.detailed,
    summary?.content?.medium,
    summary?.summaryText
  ].filter(Boolean).join("\n\n");

  if (countWords(summaryText) >= 80) {
    return {
      type: "summary",
      text: summaryText
    };
  }

  if (countWords(document.extractedText) >= 80) {
    return {
      type: "document",
      text: document.extractedText
    };
  }

  const error = new Error("Not enough extracted study material is available to generate a high-quality quiz.");
  error.status = 422;
  throw error;
}

function validateQuestions(questions) {
  if (!Array.isArray(questions)) {
    return [];
  }

  const seen = new Set();

  return questions
    .map(normalizeQuestion)
    .filter(Boolean)
    .filter((question) => {
      const key = question.question.toLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, QUESTION_MAX);
}

function normalizeQuestion(question) {
  if (!question || typeof question !== "object") {
    return null;
  }

  const options = Array.isArray(question.options)
    ? question.options.map((option) => String(option || "").trim()).filter(Boolean)
    : [];
  const correctAnswer = Number(question.correctAnswer);
  const difficulty = String(question.difficulty || "").toLowerCase();
  const normalized = {
    question: String(question.question || "").trim(),
    options,
    correctAnswer,
    difficulty,
    explanation: String(question.explanation || "").trim()
  };

  if (!normalized.question || options.length !== 4) {
    return null;
  }

  if (!Number.isInteger(correctAnswer) || correctAnswer < 0 || correctAnswer > 3) {
    return null;
  }

  if (!["easy", "medium", "hard"].includes(difficulty)) {
    return null;
  }

  if (!normalized.explanation) {
    return null;
  }

  return normalized;
}

function normalizeQuestionCount(count) {
  const parsed = Number(count || DEFAULT_QUESTION_COUNT);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_QUESTION_COUNT;
  }

  return Math.min(QUESTION_MAX, Math.max(QUESTION_MIN, Math.round(parsed)));
}

function mapQuiz(quiz) {
  return {
    id: quiz._id.toString(),
    documentId: quiz.documentId?.toString?.() || null,
    title: quiz.title,
    subject: quiz.subject,
    topic: quiz.topic,
    source: quiz.source,
    folderId: quiz.folderId?.toString?.() || null,
    selectedDocumentIds: (quiz.selectedDocumentIds || []).map((id) => id.toString()),
    generationType: quiz.generationType || "single",
    questionCount: quiz.questionCount,
    questions: quiz.questions.map((question) => ({
      id: question._id?.toString?.(),
      question: question.question,
      options: question.options,
      correctAnswer: question.correctAnswer,
      difficulty: question.difficulty,
      explanation: question.explanation
    })),
    generatedAt: quiz.generatedAt,
    updatedAt: quiz.updatedAt
  };
}

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

function getDocumentDisplayName(document) {
  return String(document.displayName || document.title || document.originalFileName || "Study Material")
    .replace(/\.pdf$/i, "")
    .replace(/\s+/g, " ")
    .trim() || "Study Material";
}

function countWords(text) {
  return String(text || "").split(/\s+/).filter(Boolean).length;
}
