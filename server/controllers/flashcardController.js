// Import flashcard service functions so this controller only handles HTTP details.
// The service handles MongoDB ownership checks and AI generation.
import {
  deleteFlashcardSetForUser,
  generateFlashcardsForUser,
  getFlashcardsForUser
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

// Called when the user deletes a flashcard deck.
// The service removes the generated deck.
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
