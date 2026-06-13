// Import Express so this file can define summary and Study Assistant endpoints.
import express from "express";
import {
  chatWithSummary,
  deleteSummary,
  generateSummaryPdfContent,
  generateSummary,
  getSummary,
  regenerateSummary
} from "../controllers/summaryController.js";
import { attachCurrentUser } from "../middleware/currentUser.js";

const router = express.Router();

// Called when the Summary page loads saved summary content.
router.get("/", attachCurrentUser, getSummary);
// Called when the user generates a summary.
// summaryService sends source text to AI and saves the result.
router.post("/generate", attachCurrentUser, generateSummary);
// Called when exporting summary notes as a PDF.
// The backend prepares clean structured content first.
router.post("/pdf-content", attachCurrentUser, generateSummaryPdfContent);
// Called by Study Assistant chat.
// The service grounds the AI answer in uploaded notes and summary text.
router.post("/:documentId/chat", attachCurrentUser, chatWithSummary);
// Called when the user regenerates an existing summary.
router.post("/:id/regenerate", attachCurrentUser, regenerateSummary);
// Called when deleting a summary.
router.delete("/:id", attachCurrentUser, deleteSummary);

export default router;
