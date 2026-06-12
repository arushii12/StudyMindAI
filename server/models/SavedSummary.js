// Import Mongoose so this file can define saved revision summaries.
import mongoose from "mongoose";

// SavedSummary stores a copy of summary text that the learner saved for Review Center.
// It is linked to userId so saved revision material stays private.
const savedSummarySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    folderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Folder",
      default: null,
      index: true
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: true,
      index: true
    },
    summaryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Summary",
      default: null,
      index: true
    },
    summaryTitle: {
      type: String,
      required: true,
      trim: true
    },
    summaryText: {
      type: String,
      required: true,
      trim: true
    },
    summaryLength: {
      type: String,
      enum: ["short", "medium", "detailed"],
      default: "short"
    },
    savedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

// Prevent duplicate saved copies of the same summary length for one user.
savedSummarySchema.index({ userId: 1, summaryId: 1, summaryLength: 1 }, { unique: true, sparse: true });
// Speed up Review Center lookups by document and summary length.
savedSummarySchema.index({ userId: 1, documentId: 1, summaryLength: 1 });

// Export the model used by reviewService.
export default mongoose.model("SavedSummary", savedSummarySchema);
