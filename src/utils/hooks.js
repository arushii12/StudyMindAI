import { useEffect } from "react";

export const TOAST_DISMISS_MS = 5000;

// Automatically clears success toast messages after a short delay.
export function useAutoDismissMessage(message, setMessage, duration = TOAST_DISMISS_MS) {
  useEffect(() => {
    if (message.type !== "success") {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setMessage((current) => (
        current.type === "success" && current.text === message.text
          ? { type: "idle", text: "" }
          : current
      ));
    }, duration);

    return () => window.clearTimeout(timeoutId);
  }, [duration, message.text, message.type, setMessage]);
}

// Automatically clears success status objects after a short delay.
export function useAutoDismissStatus(state, setState, duration = TOAST_DISMISS_MS) {
  useEffect(() => {
    if (state.status !== "success") {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setState((current) => (
        current.status === "success" && current.message === state.message
          ? { status: "idle", message: "" }
          : current
      ));
    }, duration);

    return () => window.clearTimeout(timeoutId);
  }, [duration, setState, state.message, state.status]);
}
