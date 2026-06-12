// Import flashcard service functions so this controller only handles HTTP details.
// The service handles MongoDB ownership checks, AI generation, and progress updates.
import {
  deleteFlashcardSetForUser,
  generateFlashcardsForUser,
  getFlashcardProgressForUser,
  getFlashcardsForUser,
  saveFlashcardReviewForUser
} from "../services/flashcardService.js";

// Called when the Flashcards page loads.
// It asks the service to find the correct deck using documentId or setId from the URL query.
export async function getFlashcards(req, res, next) {
  try {
    // Pass the logged-in user and URL filters so the service can load the right deck.
    const flashcards = await getFlashcardsForUser(req.user, {
      documentId: req.query.documentId,
      setId: req.query.setId
    });
    // Send the deck data back to React.
    res.json(flashcards);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when the user clicks Generate Flashcards.
// The service uses selected study material and AI to create a new deck.
export async function generateFlashcards(req, res, next) {
  try {
    // Flow: React -> route -> controller -> service -> MongoDB source -> AI -> saved deck.
    const flashcards = await generateFlashcardsForUser(req.user, req.body);
    // 201 means a new flashcard set was created.
    res.status(201).json(flashcards);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when the learner rates a card as again or got-it.
// This updates progress for the selected flashcard deck.
export async function saveFlashcardReview(req, res, next) {
  try {
    // Save the review only after the service confirms the deck belongs to req.user.
    const progress = await saveFlashcardReviewForUser(req.user, req.params.id, req.body);
    // Return updated progress so React can update the current card and mastery state.
    res.json(progress);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when React needs saved progress for a deck.
// This is useful after refresh or when reopening flashcards later.
export async function getFlashcardProgress(req, res, next) {
  try {
    // Load progress for this deck only if the deck belongs to the logged-in user.
    const progress = await getFlashcardProgressForUser(req.user, req.params.id);
    // Return updated progress so React can update the current card and mastery state.
    res.json(progress);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when the user deletes a flashcard deck.
// The service removes the deck and related progress records.
export async function deleteFlashcardSet(req, res, next) {
  try {
    // Delete the deck only after the service checks user ownership.
    const result = await deleteFlashcardSetForUser(req.user, req.params.id);
    // Return the service result back to React.
    res.json(result);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}
