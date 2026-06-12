// Import Express so this file can define Library and PDF endpoints.
import express from "express";
import {
  deleteDocument,
  deleteDocuments,
  listDocuments,
  moveDocument,
  moveDocuments,
  renameDocument,
  uploadDocument,
  viewDocumentPdf
} from "../controllers/documentController.js";
// Documents belong to users, so these routes authenticate before touching files or MongoDB.
import { attachCurrentUser } from "../middleware/currentUser.js";
// PDF upload needs Multer before the controller runs.
// Multer saves req.file so documentService can read it.
import { handleUploadError, uploadPdf } from "../middleware/uploadPdf.js";

const router = express.Router();

// Called when the Library page needs the user's documents.
// The service builds a userId-safe MongoDB query.
router.get("/", attachCurrentUser, listDocuments);
// Called for bulk move from the Library.
// The service updates folder fields only on documents owned by this user.
router.patch("/move", attachCurrentUser, moveDocuments);
// Called for bulk delete.
// documentService removes documents plus summaries, quizzes, flashcards, and review links.
router.delete("/", attachCurrentUser, deleteDocuments);
// Called when the user uploads a PDF.
// Flow: React FormData -> auth -> Multer -> controller -> documentService -> MongoDB -> AI summary.
router.post(
  "/upload",
  attachCurrentUser,
  uploadPdf.single("file"),
  handleUploadError,
  uploadDocument
);
// Called by the PDF viewer or download button.
// The service checks ownership before the controller streams the file.
router.get("/:id/pdf", attachCurrentUser, viewDocumentPdf);
// Called when the user renames a file in the Library.
// Only the display name changes, not the stored filename.
router.patch("/:id/rename", attachCurrentUser, renameDocument);
// Called when moving one PDF.
// It reuses the same service used by bulk move.
router.patch("/:id/move", attachCurrentUser, moveDocument);
// Called when deleting one PDF.
// The service uses the same cleanup path as bulk delete.
router.delete("/:id", attachCurrentUser, deleteDocument);

export default router;
