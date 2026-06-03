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

router.get("/folders", attachCurrentUser, listReviewFolders);
router.get("/folders/:folderId/summaries", attachCurrentUser, listFolderSavedSummaries);
router.get("/folders/:folderId/questions", attachCurrentUser, listFolderMarkedQuestions);
router.post("/summaries", attachCurrentUser, saveSummary);
router.get("/summaries", attachCurrentUser, listSavedSummaries);
router.delete("/summaries/:id", attachCurrentUser, deleteSavedSummary);
router.post("/questions", attachCurrentUser, markQuestion);
router.get("/questions", attachCurrentUser, listMarkedQuestions);
router.delete("/questions/:id", attachCurrentUser, deleteMarkedQuestion);

export default router;
