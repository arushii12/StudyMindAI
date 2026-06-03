import mongoose from "mongoose";

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
    importantQuestions: {
      type: [String],
      default: []
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

summarySchema.index({ userId: 1, documentId: 1 }, { unique: true });
summarySchema.index({ userId: 1, folderId: 1, generationType: 1, updatedAt: -1 });

export default mongoose.model("Summary", summarySchema);
