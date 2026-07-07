import React, { useEffect } from "react";
import { LoadingButton } from "./Loading.jsx";

// Shared confirmation dialog for delete, clear, remove, and retake flows.
export default function ConfirmationModal({
  confirmClassName = "danger",
  confirmLabel = "Delete",
  isConfirming = false,
  message,
  onCancel,
  onConfirm,
  title
}) {
  // Lets Escape cancel the modal when no confirm action is running.
  useEffect(() => {
    function handleKeydown(event) {
      if (event.key === "Escape" && !isConfirming) {
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [isConfirming, onCancel]);

  return (
    <div className="confirmation-overlay" role="dialog" aria-modal="true" aria-labelledby="confirmation-title">
      <section className="confirmation-modal">
        <div>
          <span className="summary-section-label">
            {confirmLabel === "Delete" ? "Confirm Delete" : "Confirmation"}
          </span>
          <h2 id="confirmation-title">{title}</h2>
          <p>{message}</p>
        </div>
        <div className="confirmation-actions">
          <button type="button" onClick={onCancel} disabled={isConfirming}>
            Cancel
          </button>
          <LoadingButton
            className={confirmClassName}
            isLoading={isConfirming}
            loadingLabel={confirmLabel === "Delete" ? "Deleting" : "Please wait"}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </LoadingButton>
        </div>
      </section>
    </div>
  );
}
