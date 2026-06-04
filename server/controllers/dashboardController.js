import {
  getDashboardData,
  hideContinueLearningItemForUser,
  recordStudyActivityForUser,
  updateDailyGoalForUser
} from "../services/dashboardService.js";

export async function getDashboard(req, res, next) {
  try {
    const dashboard = await getDashboardData(req.user);
    res.json(dashboard);
  } catch (error) {
    next(error);
  }
}

export async function updateDailyGoal(req, res, next) {
  try {
    const result = await updateDailyGoalForUser(req.user, req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function recordStudyActivity(req, res, next) {
  try {
    const result = await recordStudyActivityForUser(req.user, req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function hideContinueLearningItem(req, res, next) {
  try {
    const result = await hideContinueLearningItemForUser(req.user, req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
}
