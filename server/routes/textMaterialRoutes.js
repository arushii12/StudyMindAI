import express from "express";
import {
  generateFromText,
  getTextMaterial,
  saveTextMaterial
} from "../controllers/textMaterialController.js";
import { attachCurrentUser } from "../middleware/currentUser.js";

const router = express.Router();

router.post("/", attachCurrentUser, saveTextMaterial);
router.post("/generate", attachCurrentUser, generateFromText);
router.get("/:id", attachCurrentUser, getTextMaterial);

export default router;
