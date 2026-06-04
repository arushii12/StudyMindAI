import {
  clearAuthCookie,
  getAuthenticatedUserFromRequest,
  loginUser,
  registerUser,
  setAuthCookie,
  updateUserProfile
} from "../services/authService.js";

export async function register(req, res, next) {
  try {
    const result = await registerUser(req.body);
    setAuthCookie(res, result.token);
    res.status(201).json({ user: result.user, message: "Account created." });
  } catch (error) {
    next(error);
  }
}

export async function login(req, res, next) {
  try {
    const result = await loginUser(req.body);
    setAuthCookie(res, result.token);
    res.json({ user: result.user, message: "Logged in." });
  } catch (error) {
    next(error);
  }
}

export async function me(req, res, next) {
  try {
    const user = await getAuthenticatedUserFromRequest(req);
    res.json({ user });
  } catch (error) {
    next(error);
  }
}

export async function updateProfile(req, res, next) {
  try {
    const currentUser = await getAuthenticatedUserFromRequest(req);
    const result = await updateUserProfile(currentUser, req.body);
    setAuthCookie(res, result.token);
    res.json({ user: result.user, message: "Profile updated." });
  } catch (error) {
    next(error);
  }
}

export async function logout(req, res) {
  clearAuthCookie(res);
  res.json({ message: "Logged out." });
}
