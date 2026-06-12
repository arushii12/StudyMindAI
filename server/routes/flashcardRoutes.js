// Import Express so this file can define flashcard API endpoints
// that React can call from the Flashcards page.
import express from "express";
import {
  deleteFlashcardSet,
  generateFlashcards,
  getFlashcardProgress,
  getFlashcards,
  saveFlashcardReview
} from "../controllers/flashcardController.js";
// Flashcard decks are user-specific, so each route first proves who is making the request.
import { attachCurrentUser } from "../middleware/currentUser.js";

const router = express.Router();

// Called when the Flashcards page loads.
// The controller asks the service for a deck using documentId or setId from the URL.
router.get("/", attachCurrentUser, getFlashcards);
// Called when the user clicks Generate Flashcards.
// After auth, the service asks AI to build a deck from the selected study material.
router.post("/generate", attachCurrentUser, generateFlashcards);
// Called when React needs saved deck progress after refresh or reopen.
router.get("/:id/progress", attachCurrentUser, getFlashcardProgress);
// Called when the learner rates a card as again or got-it.
// The service records the rating in FlashcardProgress.
router.post("/:id/review", attachCurrentUser, saveFlashcardReview);
// Called when the user deletes a flashcard deck.
// The service removes both the deck and progress records.
router.delete("/:id", attachCurrentUser, deleteFlashcardSet);

export default router;
