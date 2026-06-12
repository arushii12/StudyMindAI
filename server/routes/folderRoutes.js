// Import Express so this file can define folder endpoints for the Library page.
import express from "express";
import {
  createFolder,
  deleteFolder,
  getFolder,
  listFolderDocuments,
  listFolders,
  renameFolder
} from "../controllers/folderController.js";
import { attachCurrentUser } from "../middleware/currentUser.js";

const router = express.Router();

// Called when the Library needs folder cards with counts and dates.
router.get("/", attachCurrentUser, listFolders);
// Called when the user creates a folder.
// folderService cleans the name and checks duplicates.
router.post("/", attachCurrentUser, createFolder);
// Called when opening one folder.
// The service checks that this folder belongs to req.user.
router.get("/:id", attachCurrentUser, getFolder);
// Called when renaming a folder.
// Related document labels are updated so the UI stays consistent.
router.put("/:id", attachCurrentUser, renameFolder);
// Called when deleting a folder.
// The service enforces rules before deleting anything.
router.delete("/:id", attachCurrentUser, deleteFolder);
// Called when the folder detail view needs PDFs inside one folder.
router.get("/:id/documents", attachCurrentUser, listFolderDocuments);

export default router;
