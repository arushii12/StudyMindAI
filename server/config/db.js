import mongoose from "mongoose";

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

export function isDatabaseConnected() {
  return mongoose.connection.readyState === 1;
}
