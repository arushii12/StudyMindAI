// Import Mongoose so this file can define generated summary records.
import mongoose from "mongoose";

// Summary stores AI-generated study notes for one document or selected documents.
// The service reads it before calling AI again so existing summaries can be reused.
const summarySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: true,
      index: true
    },
    folderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Folder",
      default: null,
      index: true
    },
    selectedDocumentIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Document",
      default: []
    },
    generationType: {
      type: String,
      enum: ["single", "selected"],
      default: "single",
      index: true
    },
    activeLength: {
      type: String,
      enum: ["short", "medium", "detailed"],
      default: "short"
    },
    summaryLength: {
      type: String,
      enum: ["short", "medium", "detailed"],
      default: "short"
    },
    summaryText: {
      type: String,
      default: ""
    },
    content: {
      short: {
        type: String,
        default: ""
      },
      medium: {
        type: String,
        default: ""
      },
      detailed: {
        type: String,
        default: ""
      }
    },
    source: {
      type: String,
      enum: ["generated", "placeholder"],
      default: "generated"
    },
    generatedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

// Keep one main summary record per user and document.
summarySchema.index({ userId: 1, documentId: 1 }, { unique: true });
// Speed up dashboard and folder queries for selected-document summaries.
summarySchema.index({ userId: 1, folderId: 1, generationType: 1, updatedAt: -1 });

// Export the model used by summaryService and other generation flows.
export default mongoose.model("Summary", summarySchema);
