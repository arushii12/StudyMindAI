import mongoose from "mongoose";

const folderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    normalizedName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true
    }
  },
  { timestamps: true }
);

folderSchema.index({ userId: 1, normalizedName: 1 }, { unique: true });

export default mongoose.model("Folder", folderSchema);
