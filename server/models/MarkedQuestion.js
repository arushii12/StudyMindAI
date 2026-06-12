// Import Mongoose so this file can define questions marked for review.
import mongoose from "mongoose";

// MarkedQuestion stores quiz questions the learner wants to revise later.
// It keeps the question, answer, and explanation even if the quiz list changes.
const markedQuestionSchema = new mongoose.Schema(
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
      default: null,
      index: true
    },
    quizId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quiz",
      required: true,
      index: true
    },
    questionId: {
      type: String,
      required: true,
      trim: true
    },
    questionText: {
      type: String,
      required: true,
      trim: true
    },
    options: {
      type: [String],
      default: []
    },
    correctAnswer: {
      type: Number,
      required: true,
      min: 0,
      max: 3
    },
    userAnswer: {
      type: Number,
      default: null
    },
    explanation: {
      type: String,
      default: "",
      trim: true
    },
    markedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

// Prevent the same user from marking the same quiz question more than once.
markedQuestionSchema.index({ userId: 1, quizId: 1, questionId: 1 }, { unique: true });

// Export the model used by reviewService.
export default mongoose.model("MarkedQuestion", markedQuestionSchema);
