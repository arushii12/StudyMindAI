import mongoose from "mongoose";

const reviewHistorySchema = new mongoose.Schema(
  {
    cardOrder: {
      type: Number,
      required: true
    },
    rating: {
      type: String,
      enum: ["again", "almost", "got-it"],
      required: true
    },
    reviewedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const flashcardProgressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    flashcardSetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FlashcardSet",
      required: true,
      index: true
    },
    currentCardIndex: {
      type: Number,
      default: 0,
      min: 0
    },
    masteredCount: {
      type: Number,
      default: 0,
      min: 0
    },
    learningCount: {
      type: Number,
      default: 0,
      min: 0
    },
    reviewHistory: {
      type: [reviewHistorySchema],
      default: []
    },
    lastStudiedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

flashcardProgressSchema.index({ userId: 1, flashcardSetId: 1 }, { unique: true });

export default mongoose.model("FlashcardProgress", flashcardProgressSchema);
