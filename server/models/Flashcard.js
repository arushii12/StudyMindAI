// Import Mongoose so this file can describe individual flashcard records.
import mongoose from "mongoose";

// Flashcard stores one card in a form that dashboard and review queries can search easily.
// Full generated decks are stored separately in FlashcardSet.
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

// Speed up dashboard queries that group cards by user and subject.
flashcardSchema.index({ userId: 1, subject: 1 });
// Speed up review queries that need the most recently studied cards.
flashcardSchema.index({ userId: 1, reviewedAt: -1 });

// Export the model used when saving searchable flashcard records.
export default mongoose.model("Flashcard", flashcardSchema);
