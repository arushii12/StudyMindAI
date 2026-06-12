// Import Express so this file can define auth API endpoints
// that React can call from the frontend.
import express from "express";
// Import auth controllers.
// The routes below only decide which controller handles each URL.
import { login, logout, me, register, updateProfile } from "../controllers/authController.js";

const router = express.Router();

// Called when the user submits the signup form.
// The controller sends name, email, and password to authService.
router.post("/register", register);
// Called when the user submits the login form.
// authService checks the password and returns the logged-in user.
router.post("/login", login);
// Called when React starts and wants to know if a saved session is still valid.
router.get("/me", me);
// Called when the user edits profile details.
// The service validates changes before saving them to MongoDB.
router.patch("/profile", updateProfile);
// Called when the user clicks Logout.
// React clears local auth state after this response.
router.post("/logout", logout);

export default router;
