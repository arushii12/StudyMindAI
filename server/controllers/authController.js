// Import auth service functions so controllers can stay small.
// The service handles validation, password hashing, JWT cookies, and MongoDB users.
import {
  clearAuthCookie,
  getAuthenticatedUserFromRequest,
  loginUser,
  registerUser,
  setAuthCookie,
  updateUserProfile
} from "../services/authService.js";

// Called when React submits the signup form.
// Flow: React -> route -> controller -> authService -> MongoDB -> response cookie.
export async function register(req, res, next) {
  try {
    // Send the signup fields to the service, where validation and user creation happen.
    const result = await registerUser(req.body);
    setAuthCookie(res, result.token);
    res.status(201).json({ user: result.user, message: "Account created." });
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when React submits the login form.
// The service checks the password against the stored hash before returning a token.
export async function login(req, res, next) {
  try {
    // Send email and password to the service so auth rules stay in one place.
    const result = await loginUser(req.body);
    setAuthCookie(res, result.token);
    res.json({ user: result.user, message: "Logged in." });
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when React checks whether the browser still has a valid session.
export async function me(req, res, next) {
  try {
    // Read the auth cookie and return the logged-in user if the token is valid.
    const user = await getAuthenticatedUserFromRequest(req);
    res.json({ user });
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when the user updates profile details.
export async function updateProfile(req, res, next) {
  try {
    // Confirm the request still has a valid session before changing profile data.
    const currentUser = await getAuthenticatedUserFromRequest(req);
    // Save only the allowed profile fields, then issue a fresh cookie if needed.
    const result = await updateUserProfile(currentUser, req.body);
    setAuthCookie(res, result.token);
    res.json({ user: result.user, message: "Profile updated." });
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when the user logs out.
// React clears local auth state after this response.
export async function logout(req, res) {
  clearAuthCookie(res);
  // Send a small confirmation; React handles the visible logout state.
  res.json({ message: "Logged out." });
}
