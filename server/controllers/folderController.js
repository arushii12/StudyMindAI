// Import folder service functions so this controller can stay focused on HTTP.
// The service validates names, checks user ownership, and updates MongoDB.
import {
  createFolderForUser,
  deleteFolderForUser,
  getFolderForUser,
  listFolderDocumentsForUser,
  listFoldersForUser,
  renameFolderForUser
} from "../services/folderService.js";

// Called when the Library needs folder cards.
export async function listFolders(req, res, next) {
  try {
    // List only folders owned by the logged-in user.
    const result = await listFoldersForUser(req.user);
    // Return the service result back to React.
    res.json(result);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when opening one folder.
// The service checks that the folder belongs to req.user.
export async function getFolder(req, res, next) {
  try {
    // Send both folder id and user id context so ownership can be enforced.
    const result = await getFolderForUser(req.user, req.params.id);
    // Return the service result back to React.
    res.json(result);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when the user creates a folder.
// The service cleans the name and prevents duplicates.
export async function createFolder(req, res, next) {
  try {
    // The service validates the folder name before inserting it into MongoDB.
    const result = await createFolderForUser(req.user, req.body);
    // 201 means the backend created a new resource.
    res.status(201).json(result);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when the user renames a folder.
// The service updates folder and document display data.
export async function renameFolder(req, res, next) {
  try {
    // Rename only this user's folder, then let the service update related document labels.
    const result = await renameFolderForUser(req.user, req.params.id, req.body);
    // Return the service result back to React.
    res.json(result);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when the user deletes a folder.
// The service checks rules before deleting it.
export async function deleteFolder(req, res, next) {
  try {
    // Delete the folder only after the service confirms ownership and folder rules.
    const result = await deleteFolderForUser(req.user, req.params.id);
    // Return the service result back to React.
    res.json(result);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when the folder detail view needs its PDFs.
export async function listFolderDocuments(req, res, next) {
  try {
    // Load documents from this folder only if the folder belongs to req.user.
    const result = await listFolderDocumentsForUser(req.user, req.params.id);
    // Return the service result back to React.
    res.json(result);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}
