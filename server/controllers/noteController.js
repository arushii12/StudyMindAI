import {
  createNoteForUser,
  deleteNoteForUser,
  getNoteForUser,
  listNotesForUser,
  updateNoteForUser
} from "../services/noteService.js";

export async function listNotes(req, res, next) {
  try {
    res.json(await listNotesForUser(req.user));
  } catch (error) {
    next(error);
  }
}

export async function getNote(req, res, next) {
  try {
    res.json(await getNoteForUser(req.user, req.params.id));
  } catch (error) {
    next(error);
  }
}

export async function createNote(req, res, next) {
  try {
    res.status(201).json(await createNoteForUser(req.user));
  } catch (error) {
    next(error);
  }
}

export async function updateNote(req, res, next) {
  try {
    res.json(await updateNoteForUser(req.user, req.params.id, req.body));
  } catch (error) {
    next(error);
  }
}

export async function deleteNote(req, res, next) {
  try {
    res.json(await deleteNoteForUser(req.user, req.params.id));
  } catch (error) {
    next(error);
  }
}
