import express from "express";
import { login, logout, me, register, updateProfile } from "../controllers/authController.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", me);
router.patch("/profile", updateProfile);
router.post("/logout", logout);

export default router;
