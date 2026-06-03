import mongoose from "mongoose";

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

studyActivitySchema.index({ userId: 1, dateKey: 1 }, { unique: true });

export default mongoose.model("StudyActivity", studyActivitySchema);
