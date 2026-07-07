const ACTIVE_TEXT_MATERIAL_KEY = "studymind:active-text-material";

// Reads the last active text material used by summary, quiz, and flashcard pages.
export function getActiveTextMaterialId() {
  try {
    return localStorage.getItem(ACTIVE_TEXT_MATERIAL_KEY) || "";
  } catch {
    return "";
  }
}

// Saves or clears the active material id and tells other components it changed.
export function setActiveTextMaterialId(documentId) {
  try {
    if (documentId) {
      localStorage.setItem(ACTIVE_TEXT_MATERIAL_KEY, documentId);
    } else {
      localStorage.removeItem(ACTIVE_TEXT_MATERIAL_KEY);
    }
    window.dispatchEvent(new Event("studymind:active-material-change"));
  } catch {
    // Explicit document links continue to work if browser storage is unavailable.
  }
}
