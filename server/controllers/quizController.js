import {
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
