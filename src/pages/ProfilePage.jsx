import React, { useState } from "react";
import { LogOut, X } from "lucide-react";
import { isValidEmail } from "../utils/validation.js";
import { getUserInitials } from "../utils/user.js";
import { LoadingBanner, LoadingButton } from "../components/Loading.jsx";
import AuthField from "../components/AuthField.jsx";

export default function ProfilePage({ user, dashboard, status, error, liveStudySeconds = 0, onLogout, onProfileUpdated }) {
  const [activeAction, setActiveAction] = useState("");
  const initials = getUserInitials(user);
  const stats = buildProfileStats(dashboard, liveStudySeconds);

  return (
    <div className="profile-page">
      <section className="profile-hero-card">
        <div className="profile-identity">
          <div className="profile-avatar-large">{initials}</div>
          <div>
            <span className="summary-breadcrumb">Profile</span>
            <h1>{user.name}</h1>
            <p>{user.email}</p>
          </div>
        </div>
        <div className="profile-action-row">
          <button type="button" onClick={() => setActiveAction("name")}>Edit Name</button>
          <button type="button" onClick={() => setActiveAction("email")}>Change Email</button>
          <button type="button" onClick={() => setActiveAction("password")}>Change Password</button>
        </div>
      </section>

      <section className="profile-overview-card">
        <div className="profile-section-heading">
          <span className="summary-section-label">Study Overview</span>
        </div>
        {status === "loading" && !dashboard ? (
          <LoadingBanner
            compact
            title="Loading study overview"
            detail="Summarizing your progress and activity."
          />
        ) : status === "error" ? (
          <div className="profile-overview-loading error">{error || "Unable to load study overview."}</div>
        ) : (
          <div className="profile-stats-row" aria-label="Profile study overview">
            {stats.map((stat) => (
              <article className="profile-stat-card" key={stat.label}>
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="profile-logout-card">
        <div>
          <span className="summary-section-label">Session</span>
          <h2>Logout</h2>
        </div>
        <button className="profile-logout-button" type="button" onClick={onLogout}>
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </section>

      {activeAction && (
        <ProfileActionModal
          action={activeAction}
          user={user}
          onClose={() => setActiveAction("")}
          onUpdated={(updatedUser) => {
            onProfileUpdated(updatedUser);
            setActiveAction("");
          }}
        />
      )}
    </div>
  );
}

// Combines saved dashboard stats with live study time for the profile page.
function buildProfileStats(dashboard, liveStudySeconds = 0) {
  const stats = dashboard?.stats || {};
  const totalStudyMinutes = Number(stats.totalStudyMinutes || 0) + Math.floor(Number(liveStudySeconds || 0) / 60);

  return [
    { label: "PDFs Uploaded", value: Number(stats.documentsUploaded || 0) },
    { label: "Quiz Attempts", value: Number(stats.quizAttempts || 0) },
    { label: "Flashcards Generated", value: Number(stats.flashcardsGenerated || 0) },
    { label: "Total Study Time", value: formatStudyMinutes(totalStudyMinutes) },
    { label: "Average Quiz Score", value: `${Number(stats.averageScore || 0)}%` }
  ];
}

// Formats study time into a short minutes/hours label.
function formatStudyMinutes(minutes) {
  const totalMinutes = Math.max(0, Math.round(Number(minutes || 0)));
  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${totalMinutes}m`;
  }

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}m`;
}

// Modal used for editing name, email, or password.
function ProfileActionModal({ action, user, onClose, onUpdated }) {
  const config = {
    name: {
      title: "Edit Name",
      submitLabel: "Save Name",
      initialForm: { name: user.name || "" }
    },
    email: {
      title: "Change Email",
      submitLabel: "Save Email",
      initialForm: { email: user.email || "" }
    },
    password: {
      title: "Change Password",
      submitLabel: "Save Password",
      initialForm: { currentPassword: "", password: "", confirmPassword: "" }
    }
  }[action];
  const [form, setForm] = useState(config.initialForm);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [requestStatus, setRequestStatus] = useState("idle");

  // Validates the selected profile action before patching the account.
  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = {};

    if (action === "name" && !form.name.trim()) {
      nextErrors.name = "Name is required.";
    }

    if (action === "email" && !isValidEmail(form.email)) {
      nextErrors.email = "Valid email is required.";
    }

    if (action === "password") {
      if (!form.currentPassword) {
        nextErrors.currentPassword = "Current password is required.";
      }

      if (form.password.length < 8) {
        nextErrors.password = "Password must be at least 8 characters.";
      }

      if (form.password !== form.confirmPassword) {
        nextErrors.confirmPassword = "Passwords do not match.";
      }
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length) {
      return;
    }

    try {
      setRequestStatus("loading");
      setMessage("");
      const response = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...form })
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (data.field) {
          setErrors({ [data.field]: data.message || "Unable to update profile." });
        }

        throw new Error(data.message || "Unable to update profile.");
      }

      onUpdated(data.user);
    } catch (updateError) {
      setMessage(updateError.message || "Unable to update profile.");
      setRequestStatus("error");
    }
  }

  return (
    <div className="confirmation-overlay" role="dialog" aria-modal="true" aria-labelledby="profile-action-title">
      <form className="profile-action-modal" onSubmit={handleSubmit}>
        <div className="profile-modal-heading">
          <h2 id="profile-action-title">{config.title}</h2>
          <button type="button" onClick={onClose} aria-label="Close profile form">
            <X size={18} />
          </button>
        </div>
        {message && <div className="auth-message error">{message}</div>}
        {action === "name" && (
          <AuthField autoComplete="name" error={errors.name} label="Name" name="name" value={form.name} onChange={setForm} />
        )}
        {action === "email" && (
          <AuthField autoComplete="email" error={errors.email} label="Email" name="email" type="email" value={form.email} onChange={setForm} />
        )}
        {action === "password" && (
          <>
            <AuthField autoComplete="current-password" error={errors.currentPassword} label="Current Password" name="currentPassword" type="password" value={form.currentPassword} onChange={setForm} />
            <AuthField autoComplete="new-password" error={errors.password} label="New Password" name="password" type="password" value={form.password} onChange={setForm} />
            <AuthField autoComplete="new-password" error={errors.confirmPassword} label="Confirm New Password" name="confirmPassword" type="password" value={form.confirmPassword} onChange={setForm} />
          </>
        )}
        <div className="profile-modal-actions">
          <button className="auth-secondary-button" type="button" onClick={onClose}>Cancel</button>
          <LoadingButton
            className="auth-primary-button"
            isLoading={requestStatus === "loading"}
            loadingLabel="Saving"
            type="submit"
          >
            {config.submitLabel}
          </LoadingButton>
        </div>
      </form>
    </div>
  );
}
