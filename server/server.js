import "dotenv/config";
import cors from "cors";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { connectDatabase } from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import documentRoutes from "./routes/documentRoutes.js";
import flashcardRoutes from "./routes/flashcardRoutes.js";
import folderRoutes from "./routes/folderRoutes.js";
import quizRoutes from "./routes/quizRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import summaryRoutes from "./routes/summaryRoutes.js";

const app = express();
const port = process.env.PORT || 5001;
const host = process.env.HOST || "127.0.0.1";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, "uploads");

app.use(cors({
  credentials: true,
  origin: process.env.CLIENT_ORIGIN || true
}));
app.use(express.json({ limit: "1mb" }));
app.use("/uploads", express.static(uploadsDir));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/flashcards", flashcardRoutes);
app.use("/api/folders", folderRoutes);
app.use("/folders", folderRoutes);
app.use("/api/quizzes", quizRoutes);
app.use("/api/review", reviewRoutes);
app.use("/api/summaries", summaryRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Route not found." });
});

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

await connectDatabase();

app.listen(port, host, () => {
  console.log(`StudyMind API listening on http://${host}:${port}`);
});
