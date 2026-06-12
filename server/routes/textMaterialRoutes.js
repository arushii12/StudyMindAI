// Import Express so this file can define endpoints for pasted text material.
import express from "express";
import {
  generateFromText,
  getTextMaterial,
  saveTextMaterial
} from "../controllers/textMaterialController.js";
import { attachCurrentUser } from "../middleware/currentUser.js";

const router = express.Router();

// Called when the user saves pasted study text.
// The service stores it like a document so other study flows can reuse it.
router.post("/", attachCurrentUser, saveTextMaterial);
// Called when pasted text should generate a summary, quiz, or flashcards.
router.post("/generate", attachCurrentUser, generateFromText);
// Called when React restores a previously saved text material.
router.get("/:id", attachCurrentUser, getTextMaterial);

export default router;
