import express from "express";
import { generateQuiz, getQuiz, submitQuizAttempt } from "../controllers/quizController.js";
import { attachCurrentUser } from "../middleware/currentUser.js";

const router = express.Router();

router.get("/", attachCurrentUser, getQuiz);
router.post("/generate", attachCurrentUser, generateQuiz);
router.post("/:id/attempt", attachCurrentUser, submitQuizAttempt);

export default router;
