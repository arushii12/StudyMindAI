import mongoose from "mongoose";

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

quizSchema.index({ userId: 1, subject: 1, topic: 1 });
quizSchema.index({ userId: 1, documentId: 1, generatedAt: -1 });
quizSchema.index({ userId: 1, folderId: 1, generationType: 1, generatedAt: -1 });

export default mongoose.model("Quiz", quizSchema);
