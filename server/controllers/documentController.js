import {
  deleteDocumentsForUser,
  getDocumentPdfForUser,
  listDocumentsForUser,
  moveDocumentsForUser,
  uploadDocumentForUser
} from "../services/documentService.js";

export async function uploadDocument(req, res, next) {
  try {
    const result = await uploadDocumentForUser(req.user, req.file, req.body);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function listDocuments(req, res, next) {
  try {
    const result = await listDocumentsForUser(req.user, req.query);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function moveDocument(req, res, next) {
  try {
    const result = await moveDocumentsForUser(req.user, [req.params.id], req.body.folderId);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function moveDocuments(req, res, next) {
  try {
    const result = await moveDocumentsForUser(req.user, req.body.documentIds, req.body.folderId);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function deleteDocument(req, res, next) {
  try {
    const result = await deleteDocumentsForUser(req.user, [req.params.id]);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function deleteDocuments(req, res, next) {
  try {
    const result = await deleteDocumentsForUser(req.user, req.body.documentIds);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function viewDocumentPdf(req, res, next) {
  try {
    const result = await getDocumentPdfForUser(req.user, req.params.id);
    const disposition = req.query.download === "1" ? "attachment" : "inline";

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${disposition}; filename="${encodeURIComponent(result.fileName)}"`);
    res.sendFile(result.filePath);
  } catch (error) {
    next(error);
  }
}
