import mongoose from "mongoose";

const dailyGoalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true
    },
    type: {
      type: String,
      enum: ["studyTime", "quiz"],
      default: "studyTime"
    },
    targetMinutes: {
      type: Number,
      default: 60,
      min: 1,
      max: 24 * 60
    },
    targetQuizzes: {
      type: Number,
      default: 3,
      min: 1,
      max: 50
    }
  },
  { timestamps: true }
);

export default mongoose.model("DailyGoal", dailyGoalSchema);
