// Import Mongoose so this file can define the MongoDB schema for daily goals.
import mongoose from "mongoose";

// DailyGoal stores one study target for each user.
// The dashboard reads this record to compare today's progress with the learner's goal.
const dailyGoalSchema = new mongoose.Schema(
  {
    // userId links the goal to one account.
    // unique prevents one user from having multiple active daily goal records.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true
    },
    // type tells the dashboard whether to track study minutes or quiz count.
    type: {
      type: String,
      enum: ["studyTime", "quiz"],
      default: "studyTime"
    },
    // targetMinutes is used when the learner chooses a time-based daily goal.
    targetMinutes: {
      type: Number,
      default: 60,
      min: 1,
      max: 24 * 60
    },
    // targetQuizzes is used when the learner chooses a quiz-based daily goal.
    targetQuizzes: {
      type: Number,
      default: 3,
      min: 1,
      max: 50
    }
  },
  { timestamps: true }
);

// Export the model so dashboardService can read and update daily goals.
export default mongoose.model("DailyGoal", dailyGoalSchema);
