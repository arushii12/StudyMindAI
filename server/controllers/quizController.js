import {
  deleteQuizForUser,
  generateQuizInsightForUser,
  generateQuizForUser,
  getQuizForUser,
  submitQuizAttemptForUser
} from "../services/quizService.js";

export async function getQuiz(req, res, next) {
  try {
    const quiz = await getQuizForUser(req.user, {
      documentId: req.query.documentId
    });
    res.json(quiz);
  } catch (error) {
    next(error);
  }
}

export async function generateQuiz(req, res, next) {
  try {
    const quiz = await generateQuizForUser(req.user, req.body);
    res.status(201).json(quiz);
  } catch (error) {
    next(error);
  }
}

export async function submitQuizAttempt(req, res, next) {
  try {
    const attempt = await submitQuizAttemptForUser(req.user, req.params.id, req.body);
    res.status(201).json(attempt);
  } catch (error) {
    next(error);
  }
}

export async function generateQuizInsight(req, res, next) {
  try {
    console.info("Generating quiz insight", {
      quizId: req.params.id,
      answerCount: Array.isArray(req.body?.answers) ? req.body.answers.length : 0,
      correctCount: req.body?.correctCount,
      incorrectCount: req.body?.incorrectCount,
      unansweredCount: req.body?.unansweredCount
    });
    const insight = await generateQuizInsightForUser(req.user, req.params.id, req.body);
    res.json(insight);
  } catch (error) {
    console.warn("Quiz insight generation failed", {
      quizId: req.params.id,
      status: error.status || 500,
      message: error.message
    });
    next(error);
  }
}

export async function deleteQuiz(req, res, next) {
  try {
    const result = await deleteQuizForUser(req.user, req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
}
