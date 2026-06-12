// Import text material service functions so pasted notes can behave like uploaded PDFs.
// The service stores text in MongoDB and reuses summary, quiz, and flashcard flows.
import {
  generateFromTextForUser,
  getTextMaterialForUser,
  saveTextMaterialForUser
} from "../services/textMaterialService.js";

// Called when the user saves pasted study text.
export async function saveTextMaterial(req, res, next) {
  try {
    // Save or update the pasted text under the current user's account.
    const response = await saveTextMaterialForUser(req.user, req.body);
    res.status(req.body.documentId ? 200 : 201).json(response);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when React restores saved pasted text.
export async function getTextMaterial(req, res, next) {
  try {
    // Load the saved text only after the service checks user ownership.
    const response = await getTextMaterialForUser(req.user, req.params.id);
    res.json(response);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when pasted text should generate a summary, quiz, or flashcards.
export async function generateFromText(req, res, next) {
  try {
    // Flow: React -> controller -> text service -> AI feature service -> MongoDB -> response.
    const response = await generateFromTextForUser(req.user, req.body);
    res.status(201).json(response);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}
