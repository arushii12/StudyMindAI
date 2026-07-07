import React, { useState } from "react";
import { GraduationCap } from "lucide-react";
import { LoadingButton } from "../components/Loading.jsx";
import AuthField from "../components/AuthField.jsx";
import { isValidEmail } from "../utils/validation.js";

// Switches between login and signup before the protected app is shown.
export default function AuthPage({ onAuthenticated }) {
  const [mode, setMode] = useState("login");

  return (
    <div className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark">
            <GraduationCap size={24} />
          </div>
          <div>
            <strong>StudyMind AI</strong>
            <span>AI study workspace</span>
          </div>
        </div>
        {mode === "login" ? (
          <LoginForm
            onAuthenticated={onAuthenticated}
            onCreateAccount={() => setMode("signup")}
          />
        ) : (
          <SignupForm
            onAuthenticated={onAuthenticated}
            onLogin={() => setMode("login")}
          />
        )}
      </section>
    </div>
  );
}

// Handles login validation and sends credentials to the auth API.
function LoginForm({ onAuthenticated, onCreateAccount }) {
  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  // Validates the login form before asking the backend to create a session.
  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = {};

    if (!form.email.trim()) {
      nextErrors.email = "Email is required.";
    }

    if (!form.password) {
      nextErrors.password = "Password is required.";
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length) {
      return;
    }

    try {
      setStatus("loading");
      setMessage("");
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Invalid email or password.");
      }

      onAuthenticated(data.user);
    } catch (loginError) {
      setMessage(loginError.message || "Invalid email or password.");
      setStatus("error");
    } finally {
      setStatus((current) => current === "loading" ? "idle" : current);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="auth-copy">
        <span>Welcome back</span>
        <h1>Login to your account</h1>
        <p>Continue with your folders, PDFs, quizzes, and flashcards.</p>
      </div>

      {message && <div className="auth-message error">{message}</div>}

      <AuthField
        autoComplete="email"
        error={errors.email}
        label="Email Address"
        name="email"
        onChange={setForm}
        type="email"
        value={form.email}
      />
      <AuthField
        autoComplete="current-password"
        error={errors.password}
        label="Password"
        name="password"
        onChange={setForm}
        type="password"
        value={form.password}
      />

      <LoadingButton
        className="auth-primary-button"
        isLoading={status === "loading"}
        loadingLabel="Logging in"
        type="submit"
      >
        Login
      </LoadingButton>
      <button className="auth-secondary-button" type="button" onClick={onCreateAccount}>
        Create Account
      </button>
    </form>
  );
}

// Handles account creation and starts an authenticated session on success.
function SignupForm({ onAuthenticated, onLogin }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: ""
  });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  // Validates signup fields before sending them to the register endpoint.
  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = {};

    if (!form.name.trim()) {
      nextErrors.name = "Name is required.";
    }

    if (!isValidEmail(form.email)) {
      nextErrors.email = "Valid email is required.";
    }

    if (form.password.length < 8) {
      nextErrors.password = "Password must be at least 8 characters.";
    }

    if (form.password !== form.confirmPassword) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length) {
      return;
    }

    try {
      setStatus("loading");
      setMessage("");
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to create account.");
      }

      onAuthenticated(data.user);
    } catch (signupError) {
      setMessage(signupError.message || "Unable to create account.");
      setStatus("error");
    } finally {
      setStatus((current) => current === "loading" ? "idle" : current);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="auth-copy">
        <span>Create account</span>
        <h1>Start studying privately</h1>
        <p>Your study material, progress, and AI history stay attached only to your account.</p>
      </div>

      {message && <div className="auth-message error">{message}</div>}

      <AuthField
        autoComplete="name"
        error={errors.name}
        label="Full Name"
        name="name"
        onChange={setForm}
        value={form.name}
      />
      <AuthField
        autoComplete="email"
        error={errors.email}
        label="Email Address"
        name="email"
        onChange={setForm}
        type="email"
        value={form.email}
      />
      <AuthField
        autoComplete="new-password"
        error={errors.password}
        label="Password"
        name="password"
        onChange={setForm}
        type="password"
        value={form.password}
      />
      <AuthField
        autoComplete="new-password"
        error={errors.confirmPassword}
        label="Confirm Password"
        name="confirmPassword"
        onChange={setForm}
        type="password"
        value={form.confirmPassword}
      />

      <LoadingButton
        className="auth-primary-button"
        isLoading={status === "loading"}
        loadingLabel="Creating account"
        type="submit"
      >
        Create Account
      </LoadingButton>
      <button className="auth-secondary-button" type="button" onClick={onLogin}>
        Login
      </button>
    </form>
  );
}
