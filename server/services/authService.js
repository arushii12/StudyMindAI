// Import bcrypt so passwords can be stored as hashes, not plain text.
import bcrypt from "bcrypt";
// Import JWT so the backend can create and verify browser sessions.
import jwt from "jsonwebtoken";
// User stores account data in MongoDB.
import User from "../models/User.js";
// Auth should fail cleanly if MongoDB is not connected.
import { isDatabaseConnected } from "../config/db.js";

// Name of the HTTP-only cookie used to store the JWT.
const TOKEN_COOKIE_NAME = "studymind_token";
// Login sessions last for seven days.
const TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
// Higher bcrypt rounds make password hashes harder to brute-force.
const BCRYPT_ROUNDS = 12;

// Called when React submits the signup form.
// It validates fields, hashes the password, saves the user, and returns a JWT.
export async function registerUser(payload = {}) {
  // Authentication requires MongoDB and JWT_SECRET.
  ensureAuthReady();

  // Normalize user input before validation and database lookup.
  const name = normalizeName(payload.name);
  const email = normalizeEmail(payload.email);
  const password = String(payload.password || "");
  const confirmPassword = String(payload.confirmPassword || "");

  // Validate required fields before saving anything.
  if (!name) {
    throwValidationError("Name is required.", "name");
  }

  validateEmail(email);
  validatePassword(password);

  if (password !== confirmPassword) {
    throwValidationError("Passwords do not match.", "confirmPassword");
  }

  // Check whether this email already exists in MongoDB.
  const existing = await User.findOne({ email }).select("+passwordHash");

  // If a completed account already has a password, block duplicate signup.
  if (existing?.passwordHash) {
    throwValidationError("Email already exists.", "email", 409);
  }

  // Store only the password hash, never the plain password.
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // If a placeholder user exists, complete that account instead of creating a duplicate.
  if (existing) {
    existing.name = name;
    existing.passwordHash = passwordHash;
    await existing.save();
    return createAuthPayload(existing);
  }

  // Create the new user record in MongoDB.
  const user = await User.create({ name, email, passwordHash });

  return createAuthPayload(user);
}

// Called when React submits the login form.
// It verifies the password hash and returns a JWT payload for the controller.
export async function loginUser(payload = {}) {
  ensureAuthReady();

  const email = normalizeEmail(payload.email);
  const password = String(payload.password || "");

  validateEmail(email, "Email is required.");

  if (!password) {
    throwValidationError("Password is required.", "password");
  }

  // passwordHash is hidden by default, so select it only for login.
  const user = await User.findOne({ email }).select("+passwordHash");
  // Compare the submitted password with the stored bcrypt hash.
  const passwordMatches = user?.passwordHash
    ? await bcrypt.compare(password, user.passwordHash)
    : false;

  if (!user || !passwordMatches) {
    throwValidationError("Invalid email or password.", "credentials", 401);
  }

  return createAuthPayload(user);
}

// Called when the user changes name, email, or password from Profile.
export async function updateUserProfile(userContext, payload = {}) {
  ensureAuthReady();

  if (!userContext?.id) {
    const error = new Error("Authentication required.");
    error.status = 401;
    throw error;
  }

  // Load the current user with passwordHash because password updates need comparison.
  const user = await User.findById(userContext.id).select("+passwordHash");

  if (!user) {
    const error = new Error("User session is no longer valid.");
    error.status = 401;
    throw error;
  }

  const action = String(payload.action || "").trim();

  // The action field tells which profile update React requested.
  if (action === "name") {
    const name = normalizeName(payload.name);

    if (!name) {
      throwValidationError("Name is required.", "name");
    }

    user.name = name;
  } else if (action === "email") {
    const email = normalizeEmail(payload.email);
    validateEmail(email);

    // Make sure the new email is not already used by another account.
    const existing = await User.findOne({ email, _id: { $ne: user._id } }).select("_id");

    if (existing) {
      throwValidationError("Email already exists.", "email", 409);
    }

    user.email = email;
  } else if (action === "password") {
    const currentPassword = String(payload.currentPassword || "");
    const password = String(payload.password || "");
    const confirmPassword = String(payload.confirmPassword || "");
    // Require the current password before allowing a password change.
    const passwordMatches = currentPassword && user.passwordHash
      ? await bcrypt.compare(currentPassword, user.passwordHash)
      : false;

    if (!passwordMatches) {
      throwValidationError("Current password is incorrect.", "currentPassword", 401);
    }

    validatePassword(password);

    if (password !== confirmPassword) {
      throwValidationError("Passwords do not match.", "confirmPassword");
    }

    // Save the new password as a bcrypt hash.
    user.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  } else {
    throwValidationError("Choose a valid profile update action.", "action");
  }

  // Save the updated profile and return a fresh auth payload.
  await user.save();
  return createAuthPayload(user);
}

// Called by middleware and controllers to read the current browser session.
export async function getAuthenticatedUserFromRequest(req) {
  ensureAuthReady();

  // Read JWT from the HTTP-only cookie or Authorization header.
  const token = readTokenFromRequest(req);

  if (!token) {
    const error = new Error("Authentication required.");
    error.status = 401;
    throw error;
  }

  let decoded;

  // Verify the JWT signature and expiry.
  try {
    decoded = jwt.verify(token, getJwtSecret());
  } catch {
    const error = new Error("Session expired. Please log in again.");
    error.status = 401;
    throw error;
  }

  // Load the user referenced by the token subject.
  const user = await User.findById(decoded.sub).lean();

  if (!user) {
    const error = new Error("User session is no longer valid.");
    error.status = 401;
    throw error;
  }

  return mapUser(user);
}

// Set the JWT in an HTTP-only cookie so frontend JavaScript cannot read it directly.
export function setAuthCookie(res, token) {
  res.cookie(TOKEN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: TOKEN_MAX_AGE_MS,
    path: "/"
  });
}

// Clear the auth cookie during logout.
export function clearAuthCookie(res) {
  res.clearCookie(TOKEN_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });
}

// Convert a User document into the safe user object returned to React.
export function mapUser(user) {
  return {
    id: user._id?.toString?.() || user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl || ""
  };
}

// Build the safe user object and signed JWT returned after login/signup.
function createAuthPayload(user) {
  const safeUser = mapUser(user);
  const token = jwt.sign(
    {
      email: safeUser.email,
      name: safeUser.name
    },
    getJwtSecret(),
    {
      subject: safeUser.id,
      expiresIn: "7d"
    }
  );

  return { user: safeUser, token };
}

// Read the token from cookie first, then from Bearer auth as a fallback.
function readTokenFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const bearer = req.get("authorization") || "";

  if (cookies[TOKEN_COOKIE_NAME]) {
    return cookies[TOKEN_COOKIE_NAME];
  }

  if (bearer.startsWith("Bearer ")) {
    return bearer.slice("Bearer ".length).trim();
  }

  return "";
}

// Parse the Cookie header into a simple key-value object.
function parseCookies(cookieHeader) {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf("=");

      if (separatorIndex === -1) {
        return cookies;
      }

      const key = decodeURIComponent(part.slice(0, separatorIndex).trim());
      const value = decodeURIComponent(part.slice(separatorIndex + 1).trim());
      cookies[key] = value;
      return cookies;
    }, {});
}

// Confirm auth dependencies are ready before auth logic runs.
function ensureAuthReady() {
  if (!isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Authentication requires MongoDB Atlas.");
    error.status = 503;
    throw error;
  }

  getJwtSecret();
}

// Read JWT_SECRET and return a controlled error if it is missing.
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    const error = new Error("JWT_SECRET is not configured.");
    error.status = 503;
    throw error;
  }

  return secret;
}

// Clean a display name before validation or saving.
function normalizeName(name) {
  return String(name || "").replace(/\s+/g, " ").trim();
}

// Normalize email so lookups are case-insensitive.
function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

// Validate email format and attach the field name to the error.
function validateEmail(email, emptyMessage = "Valid email is required.") {
  if (!email) {
    throwValidationError(emptyMessage, "email");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throwValidationError("Valid email is required.", "email");
  }
}

// Enforce the minimum password length used by signup and password change.
function validatePassword(password) {
  if (password.length < 8) {
    throwValidationError("Password must be at least 8 characters.", "password");
  }
}

// Throw a frontend-friendly validation error with a field key.
function throwValidationError(message, field, status = 400) {
  const error = new Error(message);
  error.status = status;
  error.field = field;
  throw error;
}
