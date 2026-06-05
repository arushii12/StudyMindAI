import express from "express";
import {
  chatWithSummary,
  deleteSummary,
  generateSummaryPdfContent,
  generateSummary,
  getSummary,
  getSummaryQuestions,
  regenerateSummary
} from "../controllers/summaryController.js";
import { attachCurrentUser } from "../middleware/currentUser.js";

const router = express.Router();

router.get("/", attachCurrentUser, getSummary);
router.post("/generate", attachCurrentUser, generateSummary);
router.post("/pdf-content", attachCurrentUser, generateSummaryPdfContent);
router.post("/:documentId/chat", attachCurrentUser, chatWithSummary);
router.get("/:id/questions", attachCurrentUser, getSummaryQuestions);
router.post("/:id/regenerate", attachCurrentUser, regenerateSummary);
router.delete("/:id", attachCurrentUser, deleteSummary);

export default router;
