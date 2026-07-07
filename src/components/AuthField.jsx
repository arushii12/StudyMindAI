import React from "react";

// Reusable auth/profile input with inline validation feedback.
export default function AuthField({ autoComplete, error, label, name, onChange, type = "text", value }) {
  return (
    <label className="auth-field">
      <span>{label}</span>
      <input
        aria-invalid={Boolean(error)}
        autoComplete={autoComplete}
        name={name}
        type={type}
        value={value}
        onChange={(event) => onChange((current) => ({
          ...current,
          [name]: event.target.value
        }))}
      />
      {error && <small>{error}</small>}
    </label>
  );
}
