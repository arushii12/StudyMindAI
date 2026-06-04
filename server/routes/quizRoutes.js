import express from "express";
import { deleteQuiz, generateQuiz, generateQuizInsight, getQuiz, submitQuizAttempt } from "../controllers/quizController.js";
import { attachCurrentUser } from "../middleware/currentUser.js";

const router = express.Router();

router.get("/", attachCurrentUser, getQuiz);
router.post("/generate", attachCurrentUser, generateQuiz);
router.post("/:id/attempt", attachCurrentUser, submitQuizAttempt);
router.post("/:id/insight", attachCurrentUser, generateQuizInsight);
router.delete("/:id", attachCurrentUser, deleteQuiz);

export default router;
