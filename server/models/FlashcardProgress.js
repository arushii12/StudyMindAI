// Import Mongoose so this file can define stored flashcard progress.
import mongoose from "mongoose";

// Each review history item records one learner action on one card.
// Keeping history lets the service recalculate mastery counts later.
const reviewHistorySchema = new mongoose.Schema(
  {
    cardOrder: {
      type: Number,
      required: true
    },
    rating: {
      type: String,
      enum: ["again", "got-it"],
      required: true
    },
    reviewedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

// FlashcardProgress stores where a learner is inside one flashcard deck.
// It is separate from FlashcardSet because deck content is fixed but progress changes often.
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

// One user should have only one progress record per flashcard deck.
flashcardProgressSchema.index({ userId: 1, flashcardSetId: 1 }, { unique: true });

// Export the model used by flashcardService when saving review progress.
export default mongoose.model("FlashcardProgress", flashcardProgressSchema);
