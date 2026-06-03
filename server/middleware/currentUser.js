import mongoose from "mongoose";
import User from "../models/User.js";
import { isDatabaseConnected } from "../config/db.js";

const DEFAULT_USER = {
  name: "Alex Morgan",
  email: process.env.DEFAULT_USER_EMAIL || "alex@studymind.ai"
};

export async function attachCurrentUser(req, res, next) {
  try {
    if (!isDatabaseConnected()) {
      req.user = {
        id: null,
        name: DEFAULT_USER.name,
        email: DEFAULT_USER.email,
        avatarUrl: ""
      };
      return next();
    }

    const headerUserId = req.get("x-user-id");

    if (headerUserId) {
      if (!mongoose.Types.ObjectId.isValid(headerUserId)) {
        return res.status(400).json({ message: "Invalid x-user-id header." });
      }

      const user = await User.findById(headerUserId).lean();

      if (!user) {
        return res.status(404).json({ message: "User not found." });
      }

      req.user = mapUser(user);
      return next();
    }

    const user = await User.findOneAndUpdate(
      { email: DEFAULT_USER.email },
      { $setOnInsert: DEFAULT_USER },
      { new: true, upsert: true, lean: true }
    );

    req.user = mapUser(user);
    return next();
  } catch (error) {
    next(error);
  }
}

function mapUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl || ""
  };
}
