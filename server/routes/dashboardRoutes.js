import express from "express";
import {
  getDashboard,
  recordStudyActivity,
  updateDailyGoal
} from "../controllers/dashboardController.js";
import { attachCurrentUser } from "../middleware/currentUser.js";

const router = express.Router();

router.get("/", attachCurrentUser, getDashboard);
router.put("/goal", attachCurrentUser, updateDailyGoal);
router.post("/activity", attachCurrentUser, recordStudyActivity);

export default router;
