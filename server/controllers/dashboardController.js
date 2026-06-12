// Import dashboard service functions so the controller can return screen-ready data.
// The service combines goals, activity, quizzes, flashcards, and documents from MongoDB.
import {
  getDashboardData,
  hideContinueLearningItemForUser,
  recordStudyActivityForUser,
  updateDailyGoalForUser
} from "../services/dashboardService.js";

// Called when Dashboard or Profile loads.
// Flow: React -> route -> controller -> dashboardService -> MongoDB -> dashboard response.
export async function getDashboard(req, res, next) {
  try {
    // Build one dashboard object for the logged-in user.
    const dashboard = await getDashboardData(req.user);
    res.json(dashboard);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when the user changes the daily goal.
// The service validates and saves the new target.
export async function updateDailyGoal(req, res, next) {
  try {
    // Validate the requested goal and save it against this user in MongoDB.
    const result = await updateDailyGoalForUser(req.user, req.body);
    // Return the service result back to React.
    res.json(result);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called by the frontend activity tracker.
// It records study time in MongoDB for the current day.
export async function recordStudyActivity(req, res, next) {
  try {
    // Store the active duration sent by React for today's study stats.
    const result = await recordStudyActivityForUser(req.user, req.body);
    // Return the service result back to React.
    res.json(result);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when the user hides a Continue Learning suggestion.
// The service saves that preference.
export async function hideContinueLearningItem(req, res, next) {
  try {
    // Save the hidden card key so the same suggestion does not reappear.
    const result = await hideContinueLearningItemForUser(req.user, req.body);
    // Return the service result back to React.
    res.json(result);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}
