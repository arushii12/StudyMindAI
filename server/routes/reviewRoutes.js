// Import Express so this file can define Review Center endpoints.
import express from "express";
import {
  deleteMarkedQuestion,
  deleteSavedSummary,
  listFolderMarkedQuestions,
  listFolderSavedSummaries,
  listMarkedQuestions,
  listReviewFolders,
  listSavedSummaries,
  markQuestion,
  saveSummary
} from "../controllers/reviewController.js";
import { attachCurrentUser } from "../middleware/currentUser.js";

const router = express.Router();

// Called when Review Center needs to know which folders contain saved revision items.
router.get("/folders", attachCurrentUser, listReviewFolders);
// Called when viewing saved summaries for one folder.
router.get("/folders/:folderId/summaries", attachCurrentUser, listFolderSavedSummaries);
// Called when viewing marked questions for one folder.
router.get("/folders/:folderId/questions", attachCurrentUser, listFolderMarkedQuestions);
// Called when the user saves a summary for later revision.
router.post("/summaries", attachCurrentUser, saveSummary);
// Called when Review Center lists all saved summaries.
router.get("/summaries", attachCurrentUser, listSavedSummaries);
// Called when removing a saved summary from Review Center.
router.delete("/summaries/:id", attachCurrentUser, deleteSavedSummary);
// Called when the user marks a quiz question for review.
router.post("/questions", attachCurrentUser, markQuestion);
// Called when Review Center lists marked questions.
router.get("/questions", attachCurrentUser, listMarkedQuestions);
// Called when unmarking a question.
router.delete("/questions/:id", attachCurrentUser, deleteMarkedQuestion);

export default router;
