import {
  deleteFlashcardSetForUser,
  generateFlashcardsForUser,
  getFlashcardProgressForUser,
  getFlashcardsForUser,
  saveFlashcardReviewForUser
} from "../services/flashcardService.js";

export async function getFlashcards(req, res, next) {
  try {
    const flashcards = await getFlashcardsForUser(req.user, {
      documentId: req.query.documentId
    });
    res.json(flashcards);
  } catch (error) {
    next(error);
  }
}

export async function generateFlashcards(req, res, next) {
  try {
    const flashcards = await generateFlashcardsForUser(req.user, req.body);
    res.status(201).json(flashcards);
  } catch (error) {
    next(error);
  }
}

export async function saveFlashcardReview(req, res, next) {
  try {
    const progress = await saveFlashcardReviewForUser(req.user, req.params.id, req.body);
    res.json(progress);
  } catch (error) {
    next(error);
  }
}

export async function getFlashcardProgress(req, res, next) {
  try {
    const progress = await getFlashcardProgressForUser(req.user, req.params.id);
    res.json(progress);
  } catch (error) {
    next(error);
  }
}

export async function deleteFlashcardSet(req, res, next) {
  try {
    const result = await deleteFlashcardSetForUser(req.user, req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
}
