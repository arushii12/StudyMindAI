// Import quiz service functions so this controller only handles HTTP request flow.
// The service owns AI quiz generation, scoring, MongoDB attempts, and cleanup.
import {
  deleteQuizForUser,
  generateQuizInsightForUser,
  generateQuizForUser,
  getQuizForUser,
  submitQuizAttemptForUser
} from "../services/quizService.js";

// Called when the Quiz page loads.
// The service tries to return an existing quiz for the selected source.
export async function getQuiz(req, res, next) {
  try {
    // Use the URL query to choose the source document for this user's quiz.
    const quiz = await getQuizForUser(req.user, {
      documentId: req.query.documentId
    });
    // Send quiz data back to React.
    res.json(quiz);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when the user clicks Generate Quiz.
// The service prepares source text, calls AI, validates questions, and saves them.
export async function generateQuiz(req, res, next) {
  try {
    // Flow: React -> route -> controller -> quizService -> MongoDB source -> AI -> saved quiz.
    const quiz = await generateQuizForUser(req.user, req.body);
    // 201 means a new quiz was generated and saved.
    res.status(201).json(quiz);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when the learner submits quiz answers.
// The service scores the attempt and saves it for dashboard stats.
export async function submitQuizAttempt(req, res, next) {
  try {
    // Score the submitted answers only after the service confirms quiz ownership.
    const attempt = await submitQuizAttemptForUser(req.user, req.params.id, req.body);
    // 201 means a new quiz attempt was recorded.
    res.status(201).json(attempt);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called from the Quiz Results page.
// The service asks AI for feedback using the learner's score and answers.
export async function generateQuizInsight(req, res, next) {
  try {
    console.info("Generating quiz insight", {
      quizId: req.params.id,
      answerCount: Array.isArray(req.body?.answers) ? req.body.answers.length : 0,
      correctCount: req.body?.correctCount,
      incorrectCount: req.body?.incorrectCount,
      unansweredCount: req.body?.unansweredCount
    });
    // Send result details to the service so AI can explain strengths and weak areas.
    const insight = await generateQuizInsightForUser(req.user, req.params.id, req.body);
    res.json(insight);
  } catch (error) {
    console.warn("Quiz insight generation failed", {
      quizId: req.params.id,
      status: error.status || 500,
      message: error.message
    });
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when the user deletes a quiz.
// The service removes the quiz and related attempts.
export async function deleteQuiz(req, res, next) {
  try {
    // Delete the quiz only if the service confirms it belongs to req.user.
    const result = await deleteQuizForUser(req.user, req.params.id);
    // Return the service result back to React.
    res.json(result);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}
