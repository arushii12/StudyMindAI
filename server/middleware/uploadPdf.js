import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.resolve(__dirname, "../uploads");
const maxFileSize = 10 * 1024 * 1024;

fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, uploadDir);
  },
  filename(req, file, cb) {
    const safeName = path
      .basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
    cb(null, `${Date.now()}-${safeName || "document"}.pdf`);
  }
});

function fileFilter(req, file, cb) {
  const isPdfMime = file.mimetype === "application/pdf";
  const isPdfName = path.extname(file.originalname).toLowerCase() === ".pdf";

  if (!isPdfMime || !isPdfName) {
    return cb(new Error("Only PDF files are supported."));
  }

  return cb(null, true);
}

export const uploadPdf = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: maxFileSize,
    files: 1
  }
});

export function handleUploadError(error, req, res, next) {
  if (!error) {
    return next();
  }

  if (error instanceof multer.MulterError) {
    const message = error.code === "LIMIT_FILE_SIZE"
      ? "PDF file is too large. Maximum size is 10MB."
      : error.message;
    return res.status(400).json({ message });
  }

  return res.status(400).json({ message: error.message || "Upload failed." });
}
