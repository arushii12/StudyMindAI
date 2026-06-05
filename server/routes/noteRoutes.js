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

router.get("/", attachCurrentUser, listNotes);
router.post("/", attachCurrentUser, createNote);
router.get("/:id", attachCurrentUser, getNote);
router.put("/:id", attachCurrentUser, updateNote);
router.delete("/:id", attachCurrentUser, deleteNote);

export default router;
