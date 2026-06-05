import mongoose from "mongoose";
import { isDatabaseConnected } from "../config/db.js";
import Note from "../models/Note.js";

export async function listNotesForUser(user) {
  ensureUserAndDatabase(user);
  const notes = await Note.find({ userId: user.id }).sort({ createdAt: -1 }).lean();

  return {
    notes: notes.map(mapNote),
    meta: { hasData: notes.length > 0 }
  };
}

export async function getNoteForUser(user, noteId) {
  ensureUserAndDatabase(user);
  validateNoteId(noteId);
  const note = await Note.findOne({ _id: noteId, userId: user.id }).lean();

  if (!note) {
    const error = new Error("Note not found.");
    error.status = 404;
    throw error;
  }

  return { note: mapNote(note) };
}

export async function createNoteForUser(user) {
  ensureUserAndDatabase(user);
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

export async function updateNoteForUser(user, noteId, payload = {}) {
  ensureUserAndDatabase(user);
  validateNoteId(noteId);
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

export async function deleteNoteForUser(user, noteId) {
  ensureUserAndDatabase(user);
  validateNoteId(noteId);
  const note = await Note.findOneAndDelete({ _id: noteId, userId: user.id }).lean();

  if (!note) {
    const error = new Error("Note not found.");
    error.status = 404;
    throw error;
  }

  return { message: "Note deleted successfully." };
}

function ensureUserAndDatabase(user) {
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Notes require persistence.");
    error.status = 503;
    throw error;
  }
}

function validateNoteId(noteId) {
  if (!mongoose.Types.ObjectId.isValid(noteId)) {
    const error = new Error("Invalid note id.");
    error.status = 400;
    throw error;
  }
}

function mapNote(note) {
  return {
    id: note._id.toString(),
    title: note.title,
    content: note.content || "",
    createdAt: note.createdAt
  };
}
