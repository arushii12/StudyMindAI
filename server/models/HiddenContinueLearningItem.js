import mongoose from "mongoose";

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

hiddenContinueLearningItemSchema.index({ userId: 1, subject: 1 }, { unique: true });

export default mongoose.model("HiddenContinueLearningItem", hiddenContinueLearningItemSchema);
