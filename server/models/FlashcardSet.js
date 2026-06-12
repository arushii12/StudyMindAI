// Import Mongoose so this file can define generated flashcard decks.
import mongoose from "mongoose";

// FlashcardSet stores one complete AI-generated deck.
// Progress is stored separately so card content does not change while the learner studies.
const flashcardSetSchema = new mongoose.Schema(
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
    sourceSummaryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Summary",
      default: null
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    topic: {
      type: String,
      required: true,
      trim: true
    },
    source: {
      type: String,
      enum: ["summary", "document", "selected"],
      default: "summary"
    },
    aiModel: {
      type: String,
      default: ""
    },
    cards: [
      {
        front: {
          type: String,
          required: true,
          trim: true
        },
        back: {
          type: String,
          required: true,
          trim: true
        },
        topic: {
          type: String,
          default: "",
          trim: true
        },
        difficulty: {
          type: String,
          enum: ["easy", "medium", "hard"],
          default: "medium"
        },
        order: {
          type: Number,
          required: true,
          min: 1
        }
      }
    ],
    lastStudiedAt: {
      type: Date,
      default: null
    },
    generatedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

// Speed up loading the newest deck for a document.
flashcardSetSchema.index({ userId: 1, documentId: 1, generatedAt: -1 });
// Speed up folder and selected-PDF deck history queries.
flashcardSetSchema.index({ userId: 1, folderId: 1, generationType: 1, generatedAt: -1 });

// Export the model used by flashcardService.
export default mongoose.model("FlashcardSet", flashcardSetSchema);
