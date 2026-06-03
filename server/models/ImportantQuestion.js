import mongoose from "mongoose";

const importantQuestionSchema = new mongoose.Schema(
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
      required: true,
      index: true
    },
    summaryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Summary",
      required: true,
      index: true
    },
    question: {
      type: String,
      required: true,
      trim: true
    },
    order: {
      type: Number,
      required: true,
      min: 1
    }
  },
  { timestamps: true }
);

importantQuestionSchema.index({ summaryId: 1, order: 1 });

export default mongoose.model("ImportantQuestion", importantQuestionSchema);
