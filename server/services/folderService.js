import mongoose from "mongoose";
import { isDatabaseConnected } from "../config/db.js";
import Document from "../models/Document.js";
import Folder from "../models/Folder.js";

export async function listFoldersForUser(user) {
  ensureUserAndDatabase(user);

  const folders = await Folder.aggregate([
    { $match: { userId: userObjectId(user.id) } },
    {
      $lookup: {
        from: "documents",
        let: { folderId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$folderId", "$$folderId"] },
                  { $ne: ["$status", "archived"] }
                ]
              }
            }
          },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              lastDocumentAt: { $max: { $ifNull: ["$updatedAt", "$uploadDate"] } }
            }
          }
        ],
        as: "documents"
      }
    },
    { $sort: { name: 1 } }
  ]);

  return {
    folders: folders.map((folder) => mapFolder(
      folder,
      folder.documents?.[0]?.count || 0,
      folder.documents?.[0]?.lastDocumentAt
    )),
    meta: {
      hasData: folders.length > 0
    }
  };
}

export async function getFolderForUser(user, folderId) {
  ensureUserAndDatabase(user);
  validateObjectId(folderId, "Invalid folder id.");

  const folder = await Folder.findOne({ _id: folderId, userId: user.id }).lean();

  if (!folder) {
    const error = new Error("Folder not found.");
    error.status = 404;
    throw error;
  }

  const documentCount = await Document.countDocuments({
    userId: user.id,
    folderId,
    status: { $ne: "archived" }
  });

  return {
    folder: mapFolder(folder, documentCount)
  };
}

export async function createFolderForUser(user, payload = {}) {
  ensureUserAndDatabase(user);

  const name = cleanFolderName(payload.name);

  if (!name) {
    const error = new Error("Folder name is required.");
    error.status = 400;
    throw error;
  }

  try {
    const folder = await Folder.create({
      userId: user.id,
      name,
      normalizedName: normalizeFolderName(name)
    });

    return {
      folder: mapFolder(folder.toObject(), 0),
      message: "Folder created."
    };
  } catch (error) {
    if (error.code === 11000) {
      error.message = "A folder with this name already exists.";
      error.status = 409;
    }

    throw error;
  }
}

export async function renameFolderForUser(user, folderId, payload = {}) {
  ensureUserAndDatabase(user);
  validateObjectId(folderId, "Invalid folder id.");

  const name = cleanFolderName(payload.name);

  if (!name) {
    const error = new Error("Folder name is required.");
    error.status = 400;
    throw error;
  }

  try {
    const folder = await Folder.findOneAndUpdate(
      { _id: folderId, userId: user.id },
      { name, normalizedName: normalizeFolderName(name) },
      { new: true, runValidators: true }
    ).lean();

    if (!folder) {
      const error = new Error("Folder not found.");
      error.status = 404;
      throw error;
    }

    await Document.updateMany(
      { userId: user.id, folderId },
      { folderName: folder.name, subject: folder.name }
    );

    const documentCount = await Document.countDocuments({
      userId: user.id,
      folderId,
      status: { $ne: "archived" }
    });

    return {
      folder: mapFolder(folder, documentCount),
      message: "Folder renamed."
    };
  } catch (error) {
    if (error.code === 11000) {
      error.message = "A folder with this name already exists.";
      error.status = 409;
    }

    throw error;
  }
}

export async function deleteFolderForUser(user, folderId) {
  ensureUserAndDatabase(user);
  validateObjectId(folderId, "Invalid folder id.");

  const folder = await Folder.findOne({ _id: folderId, userId: user.id }).lean();

  if (!folder) {
    const error = new Error("Folder not found.");
    error.status = 404;
    throw error;
  }

  const documentCount = await Document.countDocuments({
    userId: user.id,
    folderId,
    status: { $ne: "archived" }
  });

  if (documentCount > 0) {
    const error = new Error("This folder contains PDFs. Move or remove the PDFs before deleting the folder.");
    error.status = 409;
    throw error;
  }

  await Folder.deleteOne({ _id: folderId, userId: user.id });

  return {
    message: "Folder deleted."
  };
}

export async function listFolderDocumentsForUser(user, folderId) {
  ensureUserAndDatabase(user);
  validateObjectId(folderId, "Invalid folder id.");

  const folder = await Folder.findOne({ _id: folderId, userId: user.id }).lean();

  if (!folder) {
    const error = new Error("Folder not found.");
    error.status = 404;
    throw error;
  }

  const documents = await Document.find({
    userId: user.id,
    folderId,
    status: { $ne: "archived" }
  })
    .sort({ uploadDate: -1, updatedAt: -1 })
    .select("title originalFileName storedFileName uploadDate pageCount fileSize status summaryGenerated")
    .lean();

  return {
    folder: mapFolder(folder, documents.length),
    documents: documents.map(mapFolderDocument),
    meta: {
      hasData: documents.length > 0
    }
  };
}

export async function resolveFolderForUpload(user, payload = {}) {
  const folderId = payload.folderId || "";
  const folderName = payload.folderName || "";

  if (!folderId && !folderName) {
    return null;
  }

  ensureUserAndDatabase(user);

  if (folderId) {
    validateObjectId(folderId, "Invalid folder id.");

    const folder = await Folder.findOne({ _id: folderId, userId: user.id }).lean();

    if (!folder) {
      const error = new Error("Folder not found.");
      error.status = 404;
      throw error;
    }

    return folder;
  }

  const name = cleanFolderName(folderName);

  if (!name) {
    return null;
  }

  return Folder.findOneAndUpdate(
    { userId: user.id, normalizedName: normalizeFolderName(name) },
    { $setOnInsert: { userId: user.id, name, normalizedName: normalizeFolderName(name) } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
}

function ensureUserAndDatabase(user) {
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Configure MONGO_URI before using folders.");
    error.status = 503;
    throw error;
  }
}

function validateObjectId(id, message) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error(message);
    error.status = 400;
    throw error;
  }
}

function userObjectId(id) {
  return mongoose.Types.ObjectId.createFromHexString(id);
}

function cleanFolderName(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function normalizeFolderName(value) {
  return cleanFolderName(value).toLowerCase();
}

function mapFolder(folder, documentCount = 0, lastDocumentAt = null) {
  const updatedAt = latestDate(folder.updatedAt, lastDocumentAt);

  return {
    id: folder._id.toString(),
    name: folder.name,
    documentCount,
    createdAt: folder.createdAt,
    updatedAt
  };
}

function mapFolderDocument(document) {
  return {
    id: document._id.toString(),
    documentId: document._id.toString(),
    fileName: document.originalFileName || document.title,
    title: document.title,
    storedFileName: document.storedFileName,
    uploadDate: document.uploadDate || document.createdAt,
    pageCount: document.pageCount || 0,
    fileSize: document.fileSize || 0,
    status: document.status,
    summaryStatus: document.summaryGenerated ? "Summary Generated" : "Summary Pending"
  };
}

function latestDate(left, right) {
  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  return new Date(left) > new Date(right) ? left : right;
}
