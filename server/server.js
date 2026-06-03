import "dotenv/config";
import cors from "cors";
import express from "express";
import { connectDatabase } from "./config/db.js";
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

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

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
  console.error(error);
  res.status(error.status || 500).json({
    message: error.message || "Something went wrong."
  });
});

await connectDatabase();

app.listen(port, host, () => {
  console.log(`StudyMind API listening on http://${host}:${port}`);
});
