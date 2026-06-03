import mongoose from "mongoose";

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

savedSummarySchema.index({ userId: 1, summaryId: 1, summaryLength: 1 }, { unique: true, sparse: true });
savedSummarySchema.index({ userId: 1, documentId: 1, summaryLength: 1 });

export default mongoose.model("SavedSummary", savedSummarySchema);
