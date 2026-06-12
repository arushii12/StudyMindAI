// Import document service functions so this controller can forward PDF requests.
// The service owns file reading, MongoDB writes, cleanup, and AI summary generation.
import {
  deleteDocumentsForUser,
  getDocumentPdfForUser,
  listDocumentsForUser,
  moveDocumentsForUser,
  renameDocumentForUser,
  uploadDocumentForUser
} from "../services/documentService.js";

// Called after React uploads a PDF and Multer creates req.file.
// Flow: React FormData -> route -> Multer -> controller -> documentService -> MongoDB -> AI.
export async function uploadDocument(req, res, next) {
  try {
    // Pass the owner, uploaded file, and options to the service for validation and saving.
    const result = await uploadDocumentForUser(req.user, req.file, req.body);
    // 201 means the backend created a new resource.
    res.status(201).json(result);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when the Library page needs documents.
// Query parameters can filter by folder.
export async function listDocuments(req, res, next) {
  try {
    // Ask the service for documents owned by this user, with optional folder filters.
    const result = await listDocumentsForUser(req.user, req.query);
    // Return the service result back to React.
    res.json(result);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when one document is moved to another folder.
// It reuses the bulk move service with a single id.
export async function moveDocument(req, res, next) {
  try {
    // Include req.user so the service only moves documents owned by this learner.
    const result = await moveDocumentsForUser(req.user, [req.params.id], req.body.folderId);
    // Return the service result back to React.
    res.json(result);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when the user renames a PDF in the Library.
// The service changes the display name and updates related labels.
export async function renameDocument(req, res, next) {
  try {
    // Send the document id, owner, and new name to the service for validation.
    const result = await renameDocumentForUser(req.user, req.params.id, req.body);
    // Return the service result back to React.
    res.json(result);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when the user bulk-moves selected PDFs.
// The service checks ownership before changing folder data.
export async function moveDocuments(req, res, next) {
  try {
    // Bulk moves still include req.user so another user's documents cannot be moved.
    const result = await moveDocumentsForUser(req.user, req.body.documentIds, req.body.folderId);
    // Return the service result back to React.
    res.json(result);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when the user deletes one PDF.
// It reuses the bulk delete service so cleanup stays consistent.
export async function deleteDocument(req, res, next) {
  try {
    // Delete one owned document using the same cleanup path as bulk delete.
    const result = await deleteDocumentsForUser(req.user, [req.params.id]);
    // Return the service result back to React.
    res.json(result);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when the user deletes many PDFs at once.
// The service removes linked summaries, quizzes, flashcards, and review items too.
export async function deleteDocuments(req, res, next) {
  try {
    // Delete only documents owned by req.user, then remove their generated study data.
    const result = await deleteDocumentsForUser(req.user, req.body.documentIds);
    // Return the service result back to React.
    res.json(result);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when React opens or downloads a PDF.
// The service checks ownership, then the controller streams the file.
export async function viewDocumentPdf(req, res, next) {
  try {
    // Get the file path only after the service proves this PDF belongs to req.user.
    const result = await getDocumentPdfForUser(req.user, req.params.id);
    const disposition = req.query.download === "1" ? "attachment" : "inline";

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${disposition}; filename="${encodeURIComponent(result.fileName)}"`);
    res.sendFile(result.filePath);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}
