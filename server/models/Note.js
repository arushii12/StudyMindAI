import mongoose from "mongoose";

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

noteSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("Note", noteSchema);
