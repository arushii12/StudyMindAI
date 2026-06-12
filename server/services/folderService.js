// Import Mongoose so folder ids can be validated and used in aggregations.
import mongoose from "mongoose";
// Folder operations require MongoDB.
import { isDatabaseConnected } from "../config/db.js";
// Document counts are shown on folder cards.
import Document from "../models/Document.js";
// Folder stores Library folders owned by each user.
import Folder from "../models/Folder.js";

// Called when the Library page needs folder cards.
// It joins folders with document counts for the current user.
export async function listFoldersForUser(user) {
  ensureUserAndDatabase(user);

  // Aggregate folders with counts of non-archived documents inside each folder.
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

// Called when React opens one folder.
export async function getFolderForUser(user, folderId) {
  ensureUserAndDatabase(user);
  // Validate folderId before querying MongoDB.
  validateObjectId(folderId, "Invalid folder id.");

  // Find the folder only if it belongs to this user.
  const folder = await Folder.findOne({ _id: folderId, userId: user.id }).lean();

  if (!folder) {
    const error = new Error("Folder not found.");
    error.status = 404;
    throw error;
  }

  // Count documents in this folder for the folder detail header.
  const documentCount = await Document.countDocuments({
    userId: user.id,
    folderId,
    status: { $ne: "archived" }
  });

  return {
    folder: mapFolder(folder, documentCount)
  };
}

// Called when the user creates a new folder.
export async function createFolderForUser(user, payload = {}) {
  ensureUserAndDatabase(user);

  // Clean the folder name before validation and duplicate checks.
  const name = cleanFolderName(payload.name);

  if (!name) {
    const error = new Error("Folder name is required.");
    error.status = 400;
    throw error;
  }

  try {
    // Save normalizedName so duplicate checks are case-insensitive.
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
    // MongoDB duplicate key means this user already has a folder with that name.
    if (error.code === 11000) {
      error.message = "A folder with this name already exists.";
      error.status = 409;
    }

    throw error;
  }
}

// Called when the user renames a folder.
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
    // Rename only a folder owned by this user.
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

    // Update document folder labels so Library cards stay consistent.
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

// Called when the user deletes an empty folder.
export async function deleteFolderForUser(user, folderId) {
  ensureUserAndDatabase(user);
  validateObjectId(folderId, "Invalid folder id.");

  // Find the folder only if it belongs to this user.
  const folder = await Folder.findOne({ _id: folderId, userId: user.id }).lean();

  if (!folder) {
    const error = new Error("Folder not found.");
    error.status = 404;
    throw error;
  }

  // Do not delete folders that still contain PDFs.
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

  // Delete the folder after ownership and empty-folder checks pass.
  await Folder.deleteOne({ _id: folderId, userId: user.id });

  return {
    message: "Folder deleted."
  };
}

// Called when the folder detail view lists PDFs inside one folder.
export async function listFolderDocumentsForUser(user, folderId) {
  ensureUserAndDatabase(user);
  validateObjectId(folderId, "Invalid folder id.");

  // Check folder ownership before listing its documents.
  const folder = await Folder.findOne({ _id: folderId, userId: user.id }).lean();

  if (!folder) {
    const error = new Error("Folder not found.");
    error.status = 404;
    throw error;
  }

  // List only this user's non-archived documents in the folder.
  const documents = await Document.find({
    userId: user.id,
    folderId,
    status: { $ne: "archived" }
  })
    .sort({ uploadDate: -1, updatedAt: -1 })
    .select("title displayName originalFileName storedFileName filePath uploadDate pageCount fileSize status summaryGenerated")
    .lean();

  return {
    folder: mapFolder(folder, documents.length),
    documents: documents.map(mapFolderDocument),
    meta: {
      hasData: documents.length > 0
    }
  };
}

// Used by upload flow to resolve an existing folder or create one by name.
export async function resolveFolderForUpload(user, payload = {}) {
  const folderId = payload.folderId || "";
  const folderName = payload.folderName || "";

  if (!folderId && !folderName) {
    return null;
  }

  ensureUserAndDatabase(user);

  if (folderId) {
    // If React sends folderId, verify it belongs to the current user.
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

  // If React sends a new folder name, create or reuse it with an upsert.
  return Folder.findOneAndUpdate(
    { userId: user.id, normalizedName: normalizeFolderName(name) },
    { $setOnInsert: { userId: user.id, name, normalizedName: normalizeFolderName(name) } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
}

// Shared guard for folder operations that require auth and MongoDB.
function ensureUserAndDatabase(user) {
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Configure MONGO_URI before using folders.");
    error.status = 503;
    throw error;
  }
}

// Validate MongoDB ObjectIds before querying.
function validateObjectId(id, message) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error(message);
    error.status = 400;
    throw error;
  }
}

// Convert a string id into ObjectId for aggregation matching.
function userObjectId(id) {
  return mongoose.Types.ObjectId.createFromHexString(id);
}

// Clean folder names before saving or comparing.
function cleanFolderName(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

// Normalize folder names for case-insensitive duplicate detection.
function normalizeFolderName(value) {
  return cleanFolderName(value).toLowerCase();
}

// Convert a Folder record into the response shape React uses.
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

// Convert a Document record into the folder detail response shape.
function mapFolderDocument(document) {
  const documentId = document._id.toString();
  const displayName = getDocumentDisplayName(document);

  return {
    id: documentId,
    documentId,
    fileName: displayName,
    title: displayName,
    displayName,
    originalFileName: document.originalFileName,
    storedFileName: document.storedFileName,
    filePath: document.filePath,
    pdfUrl: buildPdfUrl(documentId),
    fileUrl: buildStaticFileUrl(document.storedFileName),
    uploadDate: document.uploadDate || document.createdAt,
    pageCount: document.pageCount || 0,
    fileSize: document.fileSize || 0,
    status: document.status,
    summaryStatus: document.summaryGenerated ? "Summary Generated" : "Summary Pending"
  };
}

// Choose the display name for a document in folder views.
function getDocumentDisplayName(document) {
  return String(document.displayName || document.title || document.originalFileName || "Uploaded Document")
    .replace(/\.pdf$/i, "")
    .replace(/\s+/g, " ")
    .trim() || "Uploaded Document";
}

// Build the protected PDF URL for the document viewer.
function buildPdfUrl(documentId) {
  return `/api/documents/${documentId}/pdf`;
}

// Build a static upload URL for stored files.
function buildStaticFileUrl(storedFileName) {
  return storedFileName ? `/uploads/${encodeURIComponent(storedFileName)}` : "";
}

// Return the newest of two dates for folder activity.
function latestDate(left, right) {
  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  return new Date(left) > new Date(right) ? left : right;
}
