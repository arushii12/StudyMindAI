import React from "react";

// Skeleton layout shown while dashboard data is loading.
export function DashboardSkeleton({ stats }) {
  return (
    <>
      <section className="stats-grid">
        {stats.map((stat) => (
          <div className="stat-card skeleton" key={stat.key} />
        ))}
      </section>
      <section className="progress-layout">
        <div className="panel progress-panel skeleton-panel" />
        <div className="panel insights-panel skeleton-panel" />
      </section>
    </>
  );
}

// Skeleton layout shown while summary data is loading.
export function SummarySkeleton() {
  return (
    <div className="summary-page">
      <div className="summary-header skeleton-panel" />
      <div className="summary-card skeleton-panel" />
      <section className="summary-actions-grid">
        <div className="summary-action-card skeleton-panel" />
        <div className="summary-action-card skeleton-panel" />
      </section>
    </div>
  );
}

// Skeleton layout shown while quiz data is loading.
export function QuizSkeleton() {
  return (
    <div className="quiz-page">
      <div className="quiz-header skeleton-panel" />
      <div className="quiz-meta-card skeleton-panel" />
      <div className="quiz-question-card skeleton-panel" />
      <div className="quiz-question-card skeleton-panel" />
    </div>
  );
}

// Skeleton layout shown while flashcard data is loading.
export function FlashcardsSkeleton() {
  return (
    <div className="flashcards-page">
      <div className="flashcards-header skeleton-panel" />
      <div className="flashcards-info skeleton-panel" />
      <div className="flashcard-study-area skeleton-panel" />
    </div>
  );
}
