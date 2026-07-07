import React from "react";

// Empty dashboard banner shown before the user has study activity.
export function EmptyDataBanner() {
  return (
    <div className="empty-banner">
      <strong>No study activity yet.</strong>
      <span>Dashboard metrics will update from your documents, quiz attempts, and flashcards.</span>
    </div>
  );
}

// Reusable empty state used across dashboard, Library, and study pages.
export function EmptyPanel({ title, text }) {
  return (
    <div className="empty-panel">
      <strong>{title}</strong>
      {text && <p>{text}</p>}
    </div>
  );
}

// Dashboard error state shown when backend loading fails.
export function ErrorState({ message }) {
  return (
    <section className="state-card">
      <strong>Dashboard could not load.</strong>
      <p>{message}</p>
    </section>
  );
}
