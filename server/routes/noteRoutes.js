// Import Express so this file can define note endpoints.
import express from "express";
import {
  createNote,
  deleteNote,
  getNote,
  listNotes,
  updateNote
} from "../controllers/noteController.js";
import { attachCurrentUser } from "../middleware/currentUser.js";

const router = express.Router();

// Called when the Notes page loads the current user's notes.
router.get("/", attachCurrentUser, listNotes);
// Called when the user creates a new note.
// The backend creates a blank draft and returns its id.
router.post("/", attachCurrentUser, createNote);
// Called when opening one note.
// noteService checks both note id and user id.
router.get("/:id", attachCurrentUser, getNote);
// Called when saving note title or content.
router.put("/:id", attachCurrentUser, updateNote);
// Called when deleting one note owned by the current user.
router.delete("/:id", attachCurrentUser, deleteNote);

export default router;
