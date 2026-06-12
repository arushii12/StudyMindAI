// Import Mongoose so this file can define saved quiz records.
import mongoose from "mongoose";

// Quiz stores AI-generated questions, options, correct answers, and explanations.
// Each query includes userId so a learner can only access their own quizzes.
const quizSchema = new mongoose.Schema(
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
    title: {
      type: String,
      required: true,
      trim: true
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
      trim: true,
      index: true
    },
    questionCount: {
      type: Number,
      default: 0,
      min: 0
    },
    source: {
      type: String,
      enum: ["summary", "document", "pdf", "selected"],
      default: "summary"
    },
    aiModel: {
      type: String,
      default: ""
    },
    questions: [
      {
        question: {
          type: String,
          required: true,
          trim: true
        },
        options: {
          type: [String],
          required: true,
          validate: {
            validator(options) {
              return Array.isArray(options) && options.length === 4 && options.every(Boolean);
            },
            message: "Each quiz question must have exactly four options."
          }
        },
        correctAnswer: {
          type: Number,
          required: true,
          min: 0,
          max: 3
        },
        difficulty: {
          type: String,
          enum: ["easy", "medium", "hard"],
          required: true,
          index: true
        },
        explanation: {
          type: String,
          required: true,
          trim: true
        }
      }
    ],
    generatedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

// Speed up dashboard stats grouped by subject and topic.
quizSchema.index({ userId: 1, subject: 1, topic: 1 });
// Speed up loading the latest quiz for one document.
quizSchema.index({ userId: 1, documentId: 1, generatedAt: -1 });
// Speed up folder and selected-PDF quiz history queries.
quizSchema.index({ userId: 1, folderId: 1, generationType: 1, generatedAt: -1 });

// Export the model used by quizService.
export default mongoose.model("Quiz", quizSchema);
