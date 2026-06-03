import express from "express";
import {
  deleteDocument,
  deleteDocuments,
  listDocuments,
  moveDocument,
  moveDocuments,
  uploadDocument,
  viewDocumentPdf
} from "../controllers/documentController.js";
import { attachCurrentUser } from "../middleware/currentUser.js";
import { handleUploadError, uploadPdf } from "../middleware/uploadPdf.js";

const router = express.Router();

router.get("/", attachCurrentUser, listDocuments);
router.patch("/move", attachCurrentUser, moveDocuments);
router.delete("/", attachCurrentUser, deleteDocuments);
router.post(
  "/upload",
  attachCurrentUser,
  uploadPdf.single("file"),
  handleUploadError,
  uploadDocument
);
router.get("/:id/pdf", attachCurrentUser, viewDocumentPdf);
router.patch("/:id/move", attachCurrentUser, moveDocument);
router.delete("/:id", attachCurrentUser, deleteDocument);

export default router;
