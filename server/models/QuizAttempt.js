// Import Mongoose so this file can define submitted quiz attempts.
import mongoose from "mongoose";

// QuizAttempt stores one completed quiz result.
// dashboardService uses these records for scores, weak topics, and activity trends.
const quizAttemptSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    quizId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quiz",
      default: null
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
      trim: true,
      index: true
    },
    score: {
      type: Number,
      required: true,
      min: 0
    },
    totalQuestions: {
      type: Number,
      required: true,
      min: 1
    },
    timeSpentMinutes: {
      type: Number,
      default: 0,
      min: 0
    },
    completedAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  { timestamps: true }
);

// Speed up dashboard queries that show recent quiz activity.
quizAttemptSchema.index({ userId: 1, completedAt: -1 });
// Speed up topic-level progress and weak-area calculations.
quizAttemptSchema.index({ userId: 1, topic: 1, completedAt: -1 });

// Export the model used by quizService and dashboardService.
export default mongoose.model("QuizAttempt", quizAttemptSchema);
