// Import Mongoose so this file can define application users.
import mongoose from "mongoose";

// User stores account details used for authentication and profile display.
// passwordHash is hidden by default so normal queries do not expose it.
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    passwordHash: {
      type: String,
      required: true,
      select: false
    },
    avatarUrl: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
);

// Export the model used by authService.
export default mongoose.model("User", userSchema);
