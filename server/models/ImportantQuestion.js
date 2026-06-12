// Import Mongoose so this file can define important summary questions.
import mongoose from "mongoose";

// ImportantQuestion stores AI-generated revision questions for a saved summary.
// Each record is tied to userId, documentId, and summaryId for ownership checks.
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

// Keep questions in their generated order when a summary is opened.
importantQuestionSchema.index({ summaryId: 1, order: 1 });

// Export the model used by summaryService.
export default mongoose.model("ImportantQuestion", importantQuestionSchema);
