import {
  chatWithSummaryAssistant,
  deleteSummaryForUser,
  generateSummaryForUser,
  getQuestionsForSummary,
  getSummaryForUser
} from "../services/summaryService.js";

export async function getSummary(req, res, next) {
  try {
    const summary = await getSummaryForUser(req.user, {
      documentId: req.query.documentId,
      length: req.query.length
    });
    res.json(summary);
  } catch (error) {
    next(error);
  }
}

export async function generateSummary(req, res, next) {
  try {
    const summary = await generateSummaryForUser(req.user, req.body);
    res.status(201).json(summary);
  } catch (error) {
    next(error);
  }
}

export async function regenerateSummary(req, res, next) {
  try {
    const summary = await generateSummaryForUser(req.user, {
      ...req.body,
      summaryId: req.params.id
    });
    res.json(summary);
  } catch (error) {
    next(error);
  }
}

export async function getSummaryQuestions(req, res, next) {
  try {
    const questions = await getQuestionsForSummary(req.user, req.params.id);
    res.json({ questions });
  } catch (error) {
    next(error);
  }
}

export async function deleteSummary(req, res, next) {
  try {
    const result = await deleteSummaryForUser(req.user, req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function chatWithSummary(req, res, next) {
  try {
    const answer = await chatWithSummaryAssistant(req.user, req.params.documentId, req.body);
    res.json(answer);
  } catch (error) {
    next(error);
  }
}
