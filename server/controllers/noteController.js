// Import note service functions so note rules stay outside the controller.
// Each service query includes the user id so notes remain private.
import {
  createNoteForUser,
  deleteNoteForUser,
  getNoteForUser,
  listNotesForUser,
  updateNoteForUser
} from "../services/noteService.js";

// Called when the Notes page loads.
// The service returns only notes owned by this user.
export async function listNotes(req, res, next) {
  try {
    // Return the current user's note list to React.
    res.json(await listNotesForUser(req.user));
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when React opens one note.
export async function getNote(req, res, next) {
  try {
    // Load one note only if its id belongs to this user.
    res.json(await getNoteForUser(req.user, req.params.id));
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when the user creates a note.
// The service creates a blank saved draft.
export async function createNote(req, res, next) {
  try {
    // Create a new empty note linked to the current user.
    res.status(201).json(await createNoteForUser(req.user));
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when the user saves note changes.
export async function updateNote(req, res, next) {
  try {
    // Save edited title/content only after the service checks note ownership.
    res.json(await updateNoteForUser(req.user, req.params.id, req.body));
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when the user deletes a note.
export async function deleteNote(req, res, next) {
  try {
    // Remove the note only if it belongs to the logged-in user.
    res.json(await deleteNoteForUser(req.user, req.params.id));
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}
