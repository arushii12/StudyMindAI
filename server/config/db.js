// Import Mongoose so this file can open one shared MongoDB connection for all models.
import mongoose from "mongoose";

// Called from server.js during startup.
// It connects once, then every service can use Mongoose models safely.
export async function connectDatabase() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.warn("MONGO_URI is not set. API will return empty dashboard data.");
    return false;
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000
    });
    console.log("MongoDB connected");
    return true;
  } catch (error) {
    console.warn(`MongoDB connection failed: ${error.message}`);
    return false;
  }
}

// Services call this before database-heavy work.
// It lets them return controlled errors when MongoDB is not ready.
export function isDatabaseConnected() {
  return mongoose.connection.readyState === 1;
}
