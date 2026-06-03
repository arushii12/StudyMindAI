import mongoose from "mongoose";

const flashcardSchema = new mongoose.Schema(
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
      default: null
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    topic: {
      type: String,
      required: true,
      trim: true
    },
    front: {
      type: String,
      required: true
    },
    back: {
      type: String,
      required: true
    },
    mastered: {
      type: Boolean,
      default: false
    },
    reviewedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

flashcardSchema.index({ userId: 1, subject: 1 });
flashcardSchema.index({ userId: 1, reviewedAt: -1 });

export default mongoose.model("Flashcard", flashcardSchema);
