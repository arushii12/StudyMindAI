// Import Express so this file can define dashboard API endpoints.
import express from "express";
import {
  getDashboard,
  hideContinueLearningItem,
  recordStudyActivity,
  updateDailyGoal
} from "../controllers/dashboardController.js";
// Dashboard data is personal, so every route first attaches the logged-in user.
import { attachCurrentUser } from "../middleware/currentUser.js";

const router = express.Router();

// Called when Dashboard or Profile loads.
// Flow: React -> route -> controller -> dashboardService -> MongoDB collections -> response.
router.get("/", attachCurrentUser, getDashboard);
// Called when the learner changes the daily goal.
// The service saves one goal record for this user.
router.put("/goal", attachCurrentUser, updateDailyGoal);
// Called by the frontend study timer.
// It records active study time in MongoDB.
router.post("/activity", attachCurrentUser, recordStudyActivity);
// Called when the learner hides a Continue Learning card.
// The backend stores that preference so it stays hidden.
router.post("/continue-learning/hide", attachCurrentUser, hideContinueLearningItem);

export default router;
