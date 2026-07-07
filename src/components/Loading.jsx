import { useEffect, useState } from "react";

const longLoadingMessages = [
  "Analyzing content...",
  "Extracting key concepts...",
  "Preparing AI insights...",
  "Almost ready..."
];

// Shows a small reusable spinner during API calls and loading states.
export function LoadingSpinner({ size = "md" }) {
  return <span className={`loading-spinner ${size}`} aria-hidden="true" />;
}

// Animates dots for compact loading labels.
function AnimatedDots() {
  const [dots, setDots] = useState(".");

  // Rotates the dots while a loading label is visible.
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setDots((current) => (current.length >= 3 ? "." : `${current}.`));
    }, 420);

    return () => window.clearInterval(intervalId);
  }, []);

  return <span className="loading-dots" aria-hidden="true">{dots}</span>;
}

// Cycles through longer loading messages when an AI request takes time.
function useLongLoadingMessage(messages = longLoadingMessages, delayMs = 5000, rotateMs = 2600) {
  const [messageIndex, setMessageIndex] = useState(-1);

  // Starts rotating helpful status text after a short delay.
  useEffect(() => {
    const delayId = window.setTimeout(() => setMessageIndex(0), delayMs);
    let intervalId;

    intervalId = window.setInterval(() => {
      setMessageIndex((current) => {
        if (current < 0) {
          return current;
        }

        return (current + 1) % messages.length;
      });
    }, rotateMs);

    return () => {
      window.clearTimeout(delayId);
      window.clearInterval(intervalId);
    };
  }, [delayMs, messages, rotateMs]);

  return messageIndex >= 0 ? messages[messageIndex] : "";
}

// Standard loading banner used across pages while backend or AI work is running.
export function LoadingBanner({
  title = "Loading",
  detail = "Please wait while StudyMind prepares this for you.",
  longMessages = longLoadingMessages,
  compact = false,
  className = ""
}) {
  const longMessage = useLongLoadingMessage(longMessages);
  const displayedDetail = longMessage || detail;
  const displayTitle = cleanLoadingTitle(title);

  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className={`loading-banner ${compact ? "compact" : ""} ${className}`.trim()}
      role="status"
    >
      <LoadingSpinner />
      <div>
        <strong>{displayTitle}<AnimatedDots /></strong>
        <span>{displayedDetail}</span>
      </div>
    </div>
  );
}

// Removes trailing dots so loading titles read cleanly with animated dots.
function cleanLoadingTitle(title = "Loading") {
  return String(title).replace(/\.+$/g, "").trim() || "Loading";
}

// Reusable button that swaps its label for a spinner during submit actions.
export function LoadingButton({
  children,
  isLoading = false,
  loadingLabel = "Please wait",
  className = "",
  disabled,
  ...props
}) {
  return (
    <button
      {...props}
      aria-busy={isLoading ? "true" : undefined}
      className={`${className} ${isLoading ? "loading-button" : ""}`.trim()}
      disabled={disabled || isLoading}
    >
      {isLoading ? (
        <>
          <LoadingSpinner size="sm" />
          <span>{cleanLoadingTitle(loadingLabel)}<AnimatedDots /></span>
        </>
      ) : children}
    </button>
  );
}
