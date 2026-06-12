// Import Mongoose so note ids can be validated before queries.
import mongoose from "mongoose";
// Notes require MongoDB because they are saved drafts.
import { isDatabaseConnected } from "../config/db.js";
// Note stores private learner notes.
import Note from "../models/Note.js";

// Called when the Notes page loads.
// It returns only notes owned by the logged-in user.
export async function listNotesForUser(user) {
  ensureUserAndDatabase(user);
  // Sort newest notes first so recent drafts are easy to find.
  const notes = await Note.find({ userId: user.id }).sort({ createdAt: -1 }).lean();

  return {
    notes: notes.map(mapNote),
    meta: { hasData: notes.length > 0 }
  };
}

// Called when React opens one note.
export async function getNoteForUser(user, noteId) {
  ensureUserAndDatabase(user);
  // Validate noteId before querying MongoDB.
  validateNoteId(noteId);
  // Include userId so a user cannot open someone else's note.
  const note = await Note.findOne({ _id: noteId, userId: user.id }).lean();

  if (!note) {
    const error = new Error("Note not found.");
    error.status = 404;
    throw error;
  }

  return { note: mapNote(note) };
}

// Called when the user creates a new note.
export async function createNoteForUser(user) {
  ensureUserAndDatabase(user);
  // Create a blank draft connected to this user.
  const note = await Note.create({
    userId: user.id,
    title: "Untitled Note",
    content: "",
    createdAt: new Date()
  });

  return {
    note: mapNote(note),
    message: "Note created successfully."
  };
}

// Called when the user saves note title or content.
export async function updateNoteForUser(user, noteId, payload = {}) {
  ensureUserAndDatabase(user);
  validateNoteId(noteId);
  // Clean title but preserve content exactly as the user typed it.
  const title = String(payload.title || "").replace(/\s+/g, " ").trim();
  const content = String(payload.content || "");

  if (!title) {
    const error = new Error("Note title is required.");
    error.status = 400;
    throw error;
  }

  if (title.length > 120) {
    const error = new Error("Note title must be 120 characters or fewer.");
    error.status = 400;
    throw error;
  }

  if (content.length > 100000) {
    const error = new Error("Note content is too long.");
    error.status = 400;
    throw error;
  }

  // Update only a note owned by this user.
  const note = await Note.findOneAndUpdate(
    { _id: noteId, userId: user.id },
    { title, content },
    { new: true, runValidators: true }
  ).lean();

  if (!note) {
    const error = new Error("Note not found.");
    error.status = 404;
    throw error;
  }

  return {
    note: mapNote(note),
    message: "Note saved successfully."
  };
}

// Called when the user deletes a note.
export async function deleteNoteForUser(user, noteId) {
  ensureUserAndDatabase(user);
  validateNoteId(noteId);
  // Delete only a note owned by this user.
  const note = await Note.findOneAndDelete({ _id: noteId, userId: user.id }).lean();

  if (!note) {
    const error = new Error("Note not found.");
    error.status = 404;
    throw error;
  }

  return { message: "Note deleted successfully." };
}

// Shared guard for note operations that require auth and MongoDB.
function ensureUserAndDatabase(user) {
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Notes require persistence.");
    error.status = 503;
    throw error;
  }
}

// Validate note ids before using them in MongoDB.
function validateNoteId(noteId) {
  if (!mongoose.Types.ObjectId.isValid(noteId)) {
    const error = new Error("Invalid note id.");
    error.status = 400;
    throw error;
  }
}

// Convert a Note document into the response shape React uses.
function mapNote(note) {
  return {
    id: note._id.toString(),
    title: note.title,
    content: note.content || "",
    createdAt: note.createdAt
  };
}
