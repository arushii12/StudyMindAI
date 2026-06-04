import express from "express";
import {
  deleteFlashcardSet,
  generateFlashcards,
  getFlashcardProgress,
  getFlashcards,
  saveFlashcardReview
} from "../controllers/flashcardController.js";
import { attachCurrentUser } from "../middleware/currentUser.js";

const router = express.Router();

router.get("/", attachCurrentUser, getFlashcards);
router.post("/generate", attachCurrentUser, generateFlashcards);
router.get("/:id/progress", attachCurrentUser, getFlashcardProgress);
router.post("/:id/review", attachCurrentUser, saveFlashcardReview);
router.delete("/:id", attachCurrentUser, deleteFlashcardSet);

export default router;
