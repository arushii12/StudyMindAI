// Import Mongoose so this file can define Library folder records.
import mongoose from "mongoose";

// Folder stores a learner-created Library folder.
// Services always query it with userId so folders stay private per account.
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

// Prevent the same user from creating duplicate folder names after normalization.
folderSchema.index({ userId: 1, normalizedName: 1 }, { unique: true });

// Export the model used by folderService and documentService.
export default mongoose.model("Folder", folderSchema);
