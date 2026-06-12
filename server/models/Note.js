// Import Mongoose so this file can define private learner notes.
import mongoose from "mongoose";

// Note stores the title and content typed in the Notes page.
// userId lets noteService load, update, and delete only the owner's notes.
const noteSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
      default: "Untitled Note"
    },
    content: {
      type: String,
      default: "",
      maxlength: 100000
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { versionKey: false }
);

// Show each user's newest notes first.
noteSchema.index({ userId: 1, createdAt: -1 });

// Export the model used by noteService.
export default mongoose.model("Note", noteSchema);
