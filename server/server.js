// Load environment variables before anything reads process.env.
import "dotenv/config";
// Import CORS so the React app can call this API from the browser.
import cors from "cors";
// Import Express to create the backend HTTP server.
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
// Import the database connector so the API starts only after MongoDB is ready.
import { connectDatabase } from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import documentRoutes from "./routes/documentRoutes.js";
import flashcardRoutes from "./routes/flashcardRoutes.js";
import folderRoutes from "./routes/folderRoutes.js";
import noteRoutes from "./routes/noteRoutes.js";
import quizRoutes from "./routes/quizRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import summaryRoutes from "./routes/summaryRoutes.js";
import textMaterialRoutes from "./routes/textMaterialRoutes.js";

const app = express();
const port = process.env.PORT || 5001;
const host = process.env.HOST || "127.0.0.1";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, "uploads");

// Let the frontend call this backend.
// credentials=true is important when auth data travels with requests.
app.use(cors({
  credentials: true,
  origin: process.env.CLIENT_ORIGIN || true
}));
// Parse JSON request bodies so controllers can read req.body.
// The limit protects the API from unexpectedly huge JSON payloads.
app.use(express.json({ limit: "1mb" }));
// Serve uploaded files from one known folder.
// Protected PDF access still goes through document routes when ownership matters.
app.use("/uploads", express.static(uploadsDir));

// Simple health endpoint used to quickly check whether the backend is alive.
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Mount each feature router under its API prefix.
// React calls these URLs, then routes forward to controllers and services.
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/flashcards", flashcardRoutes);
app.use("/api/folders", folderRoutes);
app.use("/folders", folderRoutes);
app.use("/api/notes", noteRoutes);
app.use("/api/quizzes", quizRoutes);
app.use("/api/review", reviewRoutes);
app.use("/api/summaries", summaryRoutes);
app.use("/api/text-materials", textMaterialRoutes);

// If no route matched, return a clean JSON 404 instead of an HTML error page.
app.use((req, res) => {
  res.status(404).json({ message: "Route not found." });
});

// Controllers send errors here with next(error).
// This keeps error responses consistent across the whole API.
app.use((error, req, res, next) => {
  const status = error.status || 500;

  if (status >= 500) {
    console.error(error);
  }

  res.status(status).json({
    message: error.message || "Something went wrong.",
    field: error.field
  });
});

// Connect MongoDB before accepting requests.
// Otherwise routes could run before the models are usable.
await connectDatabase();

app.listen(port, host, () => {
  console.log(`StudyMind API listening on http://${host}:${port}`);
});
