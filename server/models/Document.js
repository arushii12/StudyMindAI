// Import Mongoose so this file can define uploaded or pasted study materials.
import mongoose from "mongoose";

// Document stores the source material used to create summaries, quizzes, and flashcards.
// userId keeps each learner's library private in MongoDB queries.
const documentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    displayName: {
      type: String,
      trim: true
    },
    originalFileName: {
      type: String,
      required() {
        return this.fileType === "pdf";
      },
      default: "",
      trim: true
    },
    storedFileName: {
      type: String,
      required() {
        return this.fileType === "pdf";
      },
      default: "",
      trim: true
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    folderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Folder",
      default: null,
      index: true
    },
    folderName: {
      type: String,
      default: "",
      trim: true
    },
    fileType: {
      type: String,
      enum: ["pdf", "text", "notes", "doc", "other"],
      default: "other"
    },
    sourceType: {
      type: String,
      enum: ["pdf", "text"],
      default() {
        return this.fileType === "text" ? "text" : "pdf";
      }
    },
    status: {
      type: String,
      enum: ["uploaded", "processing", "ready", "archived"],
      default: "uploaded"
    },
    summaryGenerated: {
      type: Boolean,
      default: false
    },
    extractedText: {
      type: String,
      default: ""
    },
    pageCount: {
      type: Number,
      default: 0,
      min: 0
    },
    fileSize: {
      type: Number,
      default: 0,
      min: 0
    },
    filePath: {
      type: String,
      default: ""
    },
    uploadDate: {
      type: Date,
      default: Date.now
    },
    lastStudiedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

// Speed up Library lists that show the user's most recently updated documents.
documentSchema.index({ userId: 1, updatedAt: -1 });
// Speed up dashboard and search views grouped by subject.
documentSchema.index({ userId: 1, subject: 1 });
// Speed up folder detail pages that list PDFs inside one folder.
documentSchema.index({ userId: 1, folderId: 1, uploadDate: -1 });

// Export the model used by upload, library, and generation services.
export default mongoose.model("Document", documentSchema);
