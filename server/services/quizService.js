// Import Mongoose so we can validate ids before MongoDB queries.
import mongoose from "mongoose";
// Document stores the uploaded PDF or pasted text used as quiz source material.
import Document from "../models/Document.js";
// Quiz stores the AI-generated questions and answers.
import Quiz from "../models/Quiz.js";
// QuizAttempt stores submitted scores for dashboard stats.
import QuizAttempt from "../models/QuizAttempt.js";
// Summary can be reused as a cleaner quiz source when it already exists.
import Summary from "../models/Summary.js";
// AI service generates quizzes and quiz-result feedback.
import { generateQuiz, generateQuizPerformanceInsight, getActiveAiModelName } from "./aiService.js";
// Used to stop quiz work cleanly when MongoDB is not connected.
import { isDatabaseConnected } from "../config/db.js";
// Used when the learner selects multiple PDFs for one combined quiz.
import { buildSelectedPdfSource } from "./selectedPdfSourceService.js";

// Minimum valid questions required before saving an AI quiz.
const QUESTION_MIN = 8;
// Maximum questions allowed in one quiz.
const QUESTION_MAX = 15;
// Default question count when React does not send one.
const DEFAULT_QUESTION_COUNT = 8;

// Called when the Quiz page opens.
// It loads an existing quiz for the selected document instead of generating immediately.
export async function getQuizForUser(user, options = {}) {
  // Quizzes are stored per user, so the user and MongoDB connection are required.
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Quizzes require stored documents.");
    error.status = 503;
    throw error;
  }

  // Choose the requested document or fallback to the user's latest document.
  const document = await findSelectedDocument(user.id, options.documentId);

  if (!document) {
    const error = new Error("No uploaded document found for quiz generation.");
    error.status = 404;
    throw error;
  }

  // Reuse the newest quiz for this document if one already exists.
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

// Called when the user clicks Generate Quiz.
// It selects source text, asks AI for questions, validates them, and saves the quiz.
export async function generateQuizForUser(user, payload = {}) {
  // Generated quizzes must be stored, so both auth and MongoDB are required.
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Configure MONGO_URI before generating quizzes.");
    error.status = 503;
    throw error;
  }

  // If multiple PDFs were selected, combine their text before calling AI.
  const selectedSource = await buildSelectedPdfSource(user, payload);
  // Use the primary selected PDF or the single document chosen by documentId.
  const document = selectedSource?.primaryDocument || await findSelectedDocument(user.id, payload.documentId);

  if (!document) {
    const error = new Error("No uploaded document found for quiz generation.");
    error.status = 404;
    throw error;
  }

  // Use selected PDFs, an existing summary, or extracted document text as the AI source.
  const source = selectedSource || await getQuizSource(user.id, document);
  // Keep the requested question count inside the allowed range.
  const questionCount = normalizeQuestionCount(payload.questionCount);
  // Ask AI for structured quiz JSON from the selected study material.
  const generated = await generateQuiz(source.text, {
    documentTitle: source.title || getDocumentDisplayName(document),
    subject: source.subject || document.subject,
    questionCount,
    scope: source.scope || "single-document"
  });
  // Validate AI questions before storing them in MongoDB.
  const validQuestions = validateQuestions(generated.questions);

  // Reject weak AI output instead of saving too few questions.
  if (validQuestions.length < QUESTION_MIN) {
    const error = new Error("AI returned too few valid quiz questions. Please regenerate.");
    error.status = 422;
    throw error;
  }

  // Save the generated quiz with userId so ownership checks work later.
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

// Called when the learner submits quiz answers.
// It validates ownership, scores the quiz, and saves a QuizAttempt.
export async function submitQuizAttemptForUser(user, quizId, payload = {}) {
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Quiz attempts require persistence.");
    error.status = 503;
    throw error;
  }

  // Validate quizId before using it in a MongoDB query.
  if (!mongoose.Types.ObjectId.isValid(quizId)) {
    const error = new Error("Invalid quiz id.");
    error.status = 400;
    throw error;
  }

  // Load the quiz only if it belongs to the logged-in user.
  const quiz = await Quiz.findOne({ _id: quizId, userId: user.id }).lean();

  if (!quiz) {
    const error = new Error("Quiz not found.");
    error.status = 404;
    throw error;
  }

  // React sends one selected answer per question.
  const answers = Array.isArray(payload.answers) ? payload.answers : [];

  // Prevent scoring when the answer array does not match the saved quiz.
  if (answers.length !== quiz.questions.length) {
    const error = new Error("Answer count must match quiz question count.");
    error.status = 400;
    throw error;
  }

  // Require at least one real answer so empty submissions do not create attempts.
  const hasAnsweredQuestion = answers.some((answer) => {
    const selectedAnswer = Number(answer);
    return Number.isInteger(selectedAnswer) && selectedAnswer >= 0 && selectedAnswer < 4;
  });

  if (!hasAnsweredQuestion) {
    const error = new Error("Please answer at least one question before submitting.");
    error.status = 400;
    throw error;
  }

  // Compare each selected answer with the stored correct answer index.
  const score = quiz.questions.reduce((total, question, index) => {
    return total + (Number(answers[index]) === question.correctAnswer ? 1 : 0);
  }, 0);
  // Store the attempt so dashboard trends and weak-topic stats can use it.
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

// Called from the Quiz Results page.
// It sends score details to AI and returns one coaching insight.
export async function generateQuizInsightForUser(user, quizId, payload = {}) {
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Quiz insights require stored quizzes.");
    error.status = 503;
    throw error;
  }

  // Validate quizId before looking up the saved quiz.
  if (!mongoose.Types.ObjectId.isValid(quizId)) {
    const error = new Error("Invalid quiz id.");
    error.status = 400;
    throw error;
  }

  // Keep feedback scoped to quizzes owned by this user.
  const quiz = await Quiz.findOne({ _id: quizId, userId: user.id }).lean();

  if (!quiz) {
    const error = new Error("Quiz not found.");
    error.status = 404;
    throw error;
  }

  // Ask AI to explain the learner's result using normalized answer details.
  const generated = await generateQuizPerformanceInsight({
    quizTitle: payload.quizTitle || quiz.title,
    scorePercentage: payload.scorePercentage,
    correctCount: payload.correctCount,
    incorrectCount: payload.incorrectCount,
    unansweredCount: payload.unansweredCount,
    totalQuestions: payload.totalQuestions || quiz.questions.length,
    answers: normalizeInsightAnswers(payload.answers)
  });
  // Clean the AI insight before sending it back to React.
  const insight = String(generated?.insight || "").replace(/\s+/g, " ").trim();

  if (!insight) {
    const error = new Error("AI did not return a quiz performance insight.");
    error.status = 422;
    throw error;
  }

  return { insight };
}

// Called when the user deletes a quiz.
// It removes the quiz and all attempts linked to it.
export async function deleteQuizForUser(user, quizId) {
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Quizzes require stored documents.");
    error.status = 503;
    throw error;
  }

  // Validate quizId before delete operations.
  if (!mongoose.Types.ObjectId.isValid(quizId)) {
    const error = new Error("Invalid quiz id.");
    error.status = 400;
    throw error;
  }

  // Delete only a quiz owned by the current user.
  const quiz = await Quiz.findOneAndDelete({ _id: quizId, userId: user.id }).lean();

  if (!quiz) {
    const error = new Error("Quiz not found.");
    error.status = 404;
    throw error;
  }

  // Remove dependent attempts so no orphan quiz results remain.
  await QuizAttempt.deleteMany({ userId: user.id, quizId });

  return {
    deletedQuizId: quizId,
    message: "Quiz deleted successfully."
  };
}

// Normalize answer details before sending them to AI for performance feedback.
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

// Find the selected quiz source document for the user.
async function findSelectedDocument(userId, documentId) {
  if (documentId) {
    // Validate documentId before using it in MongoDB.
    if (!mongoose.Types.ObjectId.isValid(documentId)) {
      const error = new Error("Invalid document id.");
      error.status = 400;
      throw error;
    }

    // Include userId so a user cannot generate quizzes from another user's file.
    return Document.findOne({ _id: documentId, userId }).lean();
  }

  // Fallback to the user's most recently studied non-archived document.
  return Document.findOne({ userId, status: { $ne: "archived" } })
    .sort({ lastStudiedAt: -1, updatedAt: -1 })
    .lean();
}

// Pick the best text source for AI quiz generation.
// Existing summaries are preferred when they are long enough.
async function getQuizSource(userId, document) {
  if (document.fileType === "text" && countWords(document.extractedText) >= 80) {
    return {
      type: "document",
      text: document.extractedText
    };
  }

  // Look for a summary owned by this user before using raw PDF text.
  const summary = await Summary.findOne({ userId, documentId: document._id })
    .sort({ generatedAt: -1, updatedAt: -1 })
    .lean();

  const summaryText = [
    summary?.content?.detailed,
    summary?.content?.medium,
    summary?.summaryText
  ].filter(Boolean).join("\n\n");

  // Use summary text only when it has enough content for good questions.
  if (countWords(summaryText) >= 80) {
    return {
      type: "summary",
      text: summaryText
    };
  }

  // Fallback to extracted document text if no usable summary exists.
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

// Validate AI question JSON before saving it.
// This removes malformed questions, duplicates, and extra questions.
function validateQuestions(questions) {
  if (!Array.isArray(questions)) {
    return [];
  }

  // Track question text so duplicate AI questions are removed.
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

// Normalize one AI question into the shape required by the Quiz schema.
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

  // Each quiz question must have text and exactly four options.
  if (!normalized.question || options.length !== 4) {
    return null;
  }

  // correctAnswer is a zero-based option index.
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

// Keep React's requested question count inside service limits.
function normalizeQuestionCount(count) {
  const parsed = Number(count || DEFAULT_QUESTION_COUNT);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_QUESTION_COUNT;
  }

  return Math.min(QUESTION_MAX, Math.max(QUESTION_MIN, Math.round(parsed)));
}

// Convert a MongoDB quiz into the response shape React renders.
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

// Convert a MongoDB document into the small object needed by the Quiz page.
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

// Build the document title shown in quiz UI.
function getDocumentDisplayName(document) {
  return String(document.displayName || document.title || document.originalFileName || "Study Material")
    .replace(/\.pdf$/i, "")
    .replace(/\s+/g, " ")
    .trim() || "Study Material";
}

// Count words so source validation can reject very short content.
function countWords(text) {
  return String(text || "").split(/\s+/).filter(Boolean).length;
}
