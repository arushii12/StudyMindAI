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

router.get("/", attachCurrentUser, listFolders);
router.post("/", attachCurrentUser, createFolder);
router.get("/:id", attachCurrentUser, getFolder);
router.put("/:id", attachCurrentUser, renameFolder);
router.delete("/:id", attachCurrentUser, deleteFolder);
router.get("/:id/documents", attachCurrentUser, listFolderDocuments);

export default router;
