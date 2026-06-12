// Import Express so this file can define quiz endpoints.
import express from "express";
import { deleteQuiz, generateQuiz, generateQuizInsight, getQuiz, submitQuizAttempt } from "../controllers/quizController.js";
import { attachCurrentUser } from "../middleware/currentUser.js";

const router = express.Router();

// Called when the Quiz page loads.
// The service tries to reuse an existing quiz before AI generation.
router.get("/", attachCurrentUser, getQuiz);
// Called when the user clicks Generate Quiz.
// The service prepares study text, calls AI, validates questions, and saves them.
router.post("/generate", attachCurrentUser, generateQuiz);
// Called when the user submits answers.
// quizService scores the attempt and saves it for dashboard stats.
router.post("/:id/attempt", attachCurrentUser, submitQuizAttempt);
// Called from the results page for AI feedback on quiz performance.
router.post("/:id/insight", attachCurrentUser, generateQuizInsight);
// Called when deleting a quiz.
// The service also removes dependent attempt records.
router.delete("/:id", attachCurrentUser, deleteQuiz);

export default router;
