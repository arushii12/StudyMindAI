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

export async function saveSummary(req, res, next) {
  try {
    const result = await saveSummaryForReview(req.user, req.body);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function listSavedSummaries(req, res, next) {
  try {
    const result = await listSavedSummariesForReview(req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function listFolderSavedSummaries(req, res, next) {
  try {
    const result = await listSavedSummariesForReviewFolder(req.user, req.params.folderId);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function deleteSavedSummary(req, res, next) {
  try {
    const result = await removeSavedSummaryForReview(req.user, req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function markQuestion(req, res, next) {
  try {
    const result = await markQuestionForReview(req.user, req.body);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function listMarkedQuestions(req, res, next) {
  try {
    const result = await listMarkedQuestionsForReview(req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function listFolderMarkedQuestions(req, res, next) {
  try {
    const result = await listMarkedQuestionsForReviewFolder(req.user, req.params.folderId);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function deleteMarkedQuestion(req, res, next) {
  try {
    const result = await removeMarkedQuestionForReview(req.user, req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function listReviewFolders(req, res, next) {
  try {
    const result = await getReviewFoldersForUser(req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
}
