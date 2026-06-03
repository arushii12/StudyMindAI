import {
  createFolderForUser,
  deleteFolderForUser,
  getFolderForUser,
  listFolderDocumentsForUser,
  listFoldersForUser,
  renameFolderForUser
} from "../services/folderService.js";

export async function listFolders(req, res, next) {
  try {
    const result = await listFoldersForUser(req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getFolder(req, res, next) {
  try {
    const result = await getFolderForUser(req.user, req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function createFolder(req, res, next) {
  try {
    const result = await createFolderForUser(req.user, req.body);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function renameFolder(req, res, next) {
  try {
    const result = await renameFolderForUser(req.user, req.params.id, req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function deleteFolder(req, res, next) {
  try {
    const result = await deleteFolderForUser(req.user, req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function listFolderDocuments(req, res, next) {
  try {
    const result = await listFolderDocumentsForUser(req.user, req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
}
