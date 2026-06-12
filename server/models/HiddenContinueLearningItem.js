// Import Mongoose so this file can define hidden dashboard suggestions.
import mongoose from "mongoose";

// HiddenContinueLearningItem remembers which Continue Learning card a user dismissed.
// dashboardService reads it so hidden suggestions stay hidden after refresh.
const hiddenContinueLearningItemSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    subject: {
      type: String,
      required: true,
      trim: true
    },
    hiddenAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

// One user only needs one hidden record per subject.
hiddenContinueLearningItemSchema.index({ userId: 1, subject: 1 }, { unique: true });

// Export the model used by dashboardService when hiding suggestions.
export default mongoose.model("HiddenContinueLearningItem", hiddenContinueLearningItemSchema);
