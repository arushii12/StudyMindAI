import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { isDatabaseConnected } from "../config/db.js";

const TOKEN_COOKIE_NAME = "studymind_token";
const TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;

export async function registerUser(payload = {}) {
  ensureAuthReady();

  const name = normalizeName(payload.name);
  const email = normalizeEmail(payload.email);
  const password = String(payload.password || "");
  const confirmPassword = String(payload.confirmPassword || "");

  if (!name) {
    throwValidationError("Name is required.", "name");
  }

  validateEmail(email);
  validatePassword(password);

  if (password !== confirmPassword) {
    throwValidationError("Passwords do not match.", "confirmPassword");
  }

  const existing = await User.findOne({ email }).select("+passwordHash");

  if (existing?.passwordHash) {
    throwValidationError("Email already exists.", "email", 409);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  if (existing) {
    existing.name = name;
    existing.passwordHash = passwordHash;
    await existing.save();
    return createAuthPayload(existing);
  }

  const user = await User.create({ name, email, passwordHash });

  return createAuthPayload(user);
}

export async function loginUser(payload = {}) {
  ensureAuthReady();

  const email = normalizeEmail(payload.email);
  const password = String(payload.password || "");

  validateEmail(email, "Email is required.");

  if (!password) {
    throwValidationError("Password is required.", "password");
  }

  const user = await User.findOne({ email }).select("+passwordHash");
  const passwordMatches = user?.passwordHash
    ? await bcrypt.compare(password, user.passwordHash)
    : false;

  if (!user || !passwordMatches) {
    throwValidationError("Invalid email or password.", "credentials", 401);
  }

  return createAuthPayload(user);
}

export async function getAuthenticatedUserFromRequest(req) {
  ensureAuthReady();

  const token = readTokenFromRequest(req);

  if (!token) {
    const error = new Error("Authentication required.");
    error.status = 401;
    throw error;
  }

  let decoded;

  try {
    decoded = jwt.verify(token, getJwtSecret());
  } catch {
    const error = new Error("Session expired. Please log in again.");
    error.status = 401;
    throw error;
  }

  const user = await User.findById(decoded.sub).lean();

  if (!user) {
    const error = new Error("User session is no longer valid.");
    error.status = 401;
    throw error;
  }

  return mapUser(user);
}

export function setAuthCookie(res, token) {
  res.cookie(TOKEN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: TOKEN_MAX_AGE_MS,
    path: "/"
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(TOKEN_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });
}

export function mapUser(user) {
  return {
    id: user._id?.toString?.() || user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl || ""
  };
}

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

function ensureAuthReady() {
  if (!isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Authentication requires MongoDB Atlas.");
    error.status = 503;
    throw error;
  }

  getJwtSecret();
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    const error = new Error("JWT_SECRET is not configured.");
    error.status = 503;
    throw error;
  }

  return secret;
}

function normalizeName(name) {
  return String(name || "").replace(/\s+/g, " ").trim();
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function validateEmail(email, emptyMessage = "Valid email is required.") {
  if (!email) {
    throwValidationError(emptyMessage, "email");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throwValidationError("Valid email is required.", "email");
  }
}

function validatePassword(password) {
  if (password.length < 8) {
    throwValidationError("Password must be at least 8 characters.", "password");
  }
}

function throwValidationError(message, field, status = 400) {
  const error = new Error(message);
  error.status = status;
  error.field = field;
  throw error;
}
