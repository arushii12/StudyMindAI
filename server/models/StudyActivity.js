// Import Mongoose so this file can define daily study activity records.
import mongoose from "mongoose";

// StudyActivity stores the minutes a user studied on one date.
// dashboardService uses it for charts, streaks, and daily goal progress.
const studyActivitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    dateKey: {
      type: String,
      required: true,
      index: true
    },
    minutes: {
      type: Number,
      default: 0,
      min: 0
    },
    sources: {
      type: Map,
      of: Number,
      default: {}
    },
    lastActivityAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

// Keep exactly one activity row per user per day.
studyActivitySchema.index({ userId: 1, dateKey: 1 }, { unique: true });

// Export the model used when the frontend activity timer reports study time.
export default mongoose.model("StudyActivity", studyActivitySchema);
