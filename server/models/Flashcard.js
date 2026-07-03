// Import Mongoose so this file can describe individual flashcard records.
import mongoose from "mongoose";

// Flashcard stores one card in a form that dashboard queries can search easily.
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
    }
  },
  { timestamps: true }
);

// Speed up dashboard queries that group cards by user and subject.
flashcardSchema.index({ userId: 1, subject: 1 });
// Speed up dashboard queries that need recently generated cards.
flashcardSchema.index({ userId: 1, createdAt: -1 });

// Export the model used when saving searchable flashcard records.
export default mongoose.model("Flashcard", flashcardSchema);
