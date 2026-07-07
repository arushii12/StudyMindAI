import React, { useEffect, useState } from "react";
import { BookOpen, Brain, FileText, Lightbulb } from "lucide-react";
import { getActiveTextMaterialId, setActiveTextMaterialId } from "../utils/activeMaterial.js";
import { useAutoDismissStatus } from "../utils/hooks.js";
import { LoadingBanner, LoadingButton } from "../components/Loading.jsx";
import ConfirmationModal from "../components/ConfirmationModal.jsx";

// Lets users paste study text and generate AI study material from it.
export default function UploadTextPage() {
  const [title, setTitle] = useState("");
  const [studyText, setStudyText] = useState("");
  const [documentId, setDocumentId] = useState(() => getActiveTextMaterialId());
  const [activeAction, setActiveAction] = useState("");
  const [message, setMessage] = useState({ status: "idle", message: "" });
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const maxCharacters = 20000;
  useAutoDismissStatus(message, setMessage);

  // Restores the active pasted text material when returning to this page.
  useEffect(() => {
    if (!documentId) {
      return undefined;
    }

    const controller = new AbortController();

    async function loadTextMaterial() {
      try {
        const response = await fetch(`/api/text-materials/${documentId}`, {
          signal: controller.signal
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.message || "Unable to restore pasted study material.");
        }

        setTitle(data.document?.title || "");
        setStudyText(data.document?.text || data.document?.content || "");
      } catch (loadError) {
        if (loadError.name === "AbortError") {
          return;
        }

        setDocumentId("");
        setActiveTextMaterialId("");
      }
    }

    loadTextMaterial();
    return () => controller.abort();
  }, [documentId]);

  // Saves pasted text first, then asks the chosen AI endpoint to generate output.
  async function handleGenerate(action) {
    if (!studyText.trim()) {
      setMessage({ status: "error", message: "Please paste study material first." });
      return;
    }

    if (studyText.trim().split(/\s+/).filter(Boolean).length < 80) {
      setMessage({
        status: "error",
        message: "Please enter more study content to generate meaningful results."
      });
      return;
    }

    try {
      setActiveAction(action);
      setMessage({ status: "loading", message: `Generating ${action}...` });
      const saveResponse = await fetch("/api/text-materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          text: studyText,
          documentId: documentId || undefined
        })
      });
      const savedData = await saveResponse.json().catch(() => ({}));

      if (!saveResponse.ok) {
        throw new Error(savedData.message || "Unable to save study material.");
      }

      const savedDocumentId = savedData.document.id;
      setDocumentId(savedDocumentId);
      setTitle(savedData.document.title || title);
      setActiveTextMaterialId(savedDocumentId);

      const generationConfig = {
        summary: {
          endpoint: "/api/summaries/generate",
          payload: { documentId: savedDocumentId, length: "short", markStudied: false }
        },
        quiz: {
          endpoint: "/api/quizzes/generate",
          payload: { documentId: savedDocumentId, questionCount: 8 }
        },
        flashcards: {
          endpoint: "/api/flashcards/generate",
          payload: { documentId: savedDocumentId, cardCount: 12 }
        }
      }[action];
      const response = await fetch(generationConfig.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(generationConfig.payload)
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.message || "Unable to generate study material.");
      }

      window.dispatchEvent(new Event("studymind:dashboard-refresh"));

      if (action === "summary") {
        window.location.hash = `#summary?documentId=${savedDocumentId}`;
      } else if (action === "quiz") {
        window.location.hash = `#quizzes?documentId=${savedDocumentId}&quizId=${result.quiz.id}`;
      } else {
        window.location.hash = `#flashcards?documentId=${savedDocumentId}&setId=${result.flashcardSet.id}`;
      }
    } catch (generationError) {
      setMessage({
        status: "error",
        message: generationError.message || "Unable to generate study material."
      });
      setActiveAction("");
    }
  }

  // Opens confirmation before clearing non-empty pasted material.
  function handleClearRequest() {
    if (!title.trim() && !studyText.trim()) {
      return;
    }

    setClearConfirmOpen(true);
  }

  // Clears local text state and removes the active material pointer.
  function handleClearForm() {
    setTitle("");
    setStudyText("");
    setDocumentId("");
    setActiveTextMaterialId("");
    setMessage({ status: "idle", message: "" });
    setClearConfirmOpen(false);
  }

  return (
    <div className="upload-text-page">
      <header className="upload-text-header">
        <span className="summary-section-label">Text Study Material</span>
        <h1>Upload as Text</h1>
        <p>Paste study material and generate summaries, quizzes, and flashcards.</p>
      </header>

      <section className="upload-text-card">
        <label className="upload-text-field">
          <span>Title</span>
          <input
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Example, DBMS Unit 1 Notes"
            type="text"
            value={title}
          />
        </label>

        <label className="upload-text-field">
          <span>Study Text</span>
          <textarea
            maxLength={maxCharacters}
            onChange={(event) => setStudyText(event.target.value)}
            placeholder="Paste your notes, textbook content, class notes, or any study material here..."
            value={studyText}
          />
          <small>{studyText.length} / {maxCharacters}</small>
        </label>

        <div className="upload-text-tip">
          <Lightbulb size={18} />
          <span>Tip: For best results, include definitions, examples, formulas, and key points.</span>
        </div>

        {message.status === "loading" && (
          <LoadingBanner
            title={`Generating ${activeAction}`}
            detail="Using your pasted study material to prepare the result."
            compact
          />
        )}
        {message.status === "error" && (
          <div className="summary-export-status error">{message.message}</div>
        )}

        <div className="upload-text-actions">
          <LoadingButton
            disabled={Boolean(activeAction)}
            isLoading={activeAction === "summary"}
            loadingLabel="Generating Summary"
            onClick={() => handleGenerate("summary")}
            type="button"
          >
            <FileText size={18} />
            <span>Generate Summary</span>
          </LoadingButton>
          <LoadingButton
            disabled={Boolean(activeAction)}
            isLoading={activeAction === "quiz"}
            loadingLabel="Generating Quiz"
            onClick={() => handleGenerate("quiz")}
            type="button"
          >
            <Brain size={18} />
            <span>Generate Quiz</span>
          </LoadingButton>
          <LoadingButton
            disabled={Boolean(activeAction)}
            isLoading={activeAction === "flashcards"}
            loadingLabel="Generating Flashcards"
            onClick={() => handleGenerate("flashcards")}
            type="button"
          >
            <BookOpen size={18} />
            <span>Generate Flashcards</span>
          </LoadingButton>
          <button
            className="upload-text-clear"
            disabled={Boolean(activeAction)}
            onClick={handleClearRequest}
            type="button"
          >
            Clear
          </button>
        </div>
      </section>

      {clearConfirmOpen && (
        <ConfirmationModal
          title="Clear Form?"
          message="Clear the current title and study text?"
          confirmLabel="Clear"
          confirmClassName="clear"
          onCancel={() => setClearConfirmOpen(false)}
          onConfirm={handleClearForm}
        />
      )}
    </div>
  );
}
