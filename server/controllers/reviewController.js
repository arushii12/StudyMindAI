// Import Review Center service functions so this controller can route review requests.
// The service stores saved summaries and marked questions under the current user.
import {
  getReviewFoldersForUser,
  listMarkedQuestionsForReview,
  listMarkedQuestionsForReviewFolder,
  listSavedSummariesForReview,
  listSavedSummariesForReviewFolder,
  markQuestionForReview,
  removeMarkedQuestionForReview,
  removeSavedSummaryForReview,
  saveSummaryForReview
} from "../services/reviewService.js";

// Called when the user saves a summary for review.
export async function saveSummary(req, res, next) {
  try {
    // Save the summary snapshot with req.user so revision items stay private.
    const result = await saveSummaryForReview(req.user, req.body);
    // 201 means the backend created a new resource.
    res.status(201).json(result);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when Review Center lists saved summaries.
export async function listSavedSummaries(req, res, next) {
  try {
    // Load only saved summaries created by the logged-in user.
    const result = await listSavedSummariesForReview(req.user);
    // Return the service result back to React.
    res.json(result);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when Review Center filters saved summaries by folder.
export async function listFolderSavedSummaries(req, res, next) {
  try {
    // Filter saved summaries by folder after the service checks user ownership.
    const result = await listSavedSummariesForReviewFolder(req.user, req.params.folderId);
    // Return the service result back to React.
    res.json(result);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when the user removes a saved summary from Review Center.
export async function deleteSavedSummary(req, res, next) {
  try {
    // Remove the saved summary only if it belongs to this user.
    const result = await removeSavedSummaryForReview(req.user, req.params.id);
    // Return the service result back to React.
    res.json(result);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when the user marks a quiz question for review.
export async function markQuestion(req, res, next) {
  try {
    // Store the marked question, answer choices, explanation, and source ids for revision.
    const result = await markQuestionForReview(req.user, req.body);
    // 201 means the backend created a new resource.
    res.status(201).json(result);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when Review Center lists marked questions.
export async function listMarkedQuestions(req, res, next) {
  try {
    // Load only the marked questions saved by this user.
    const result = await listMarkedQuestionsForReview(req.user);
    // Return the service result back to React.
    res.json(result);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when Review Center filters marked questions by folder.
export async function listFolderMarkedQuestions(req, res, next) {
  try {
    // Filter marked questions by folder while keeping the query scoped to req.user.
    const result = await listMarkedQuestionsForReviewFolder(req.user, req.params.folderId);
    // Return the service result back to React.
    res.json(result);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when the user unmarks a review question.
export async function deleteMarkedQuestion(req, res, next) {
  try {
    // Remove one marked question only from the current user's review list.
    const result = await removeMarkedQuestionForReview(req.user, req.params.id);
    // Return the service result back to React.
    res.json(result);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when the UI needs folders that contain review material.
export async function listReviewFolders(req, res, next) {
  try {
    // Build folder counts from saved summaries and marked questions for this user.
    const result = await getReviewFoldersForUser(req.user);
    // Return the service result back to React.
    res.json(result);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}
