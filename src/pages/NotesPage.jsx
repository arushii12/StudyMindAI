import React, { useEffect, useState } from "react";
import { ArrowLeft, Download, FileText, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { exportNotePdf } from "../utils/appHelpers.js";
import { useAutoDismissStatus } from "../utils/hooks.js";
import { LoadingBanner, LoadingButton } from "../components/Loading.jsx";
import ConfirmationModal from "../components/ConfirmationModal.jsx";
import { EmptyPanel } from "../components/States.jsx";

function NotesPage() {
  const [notes, setNotes] = useState([]);
  const [selectedNote, setSelectedNote] = useState(null);
  const [form, setForm] = useState({ title: "", content: "" });
  const [mode, setMode] = useState("list");
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState({ status: "idle", message: "" });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  useAutoDismissStatus(message, setMessage);

  // Loads the user's saved notes when the Notes page opens.
  useEffect(() => {
    const controller = new AbortController();

    async function loadNotes() {
      try {
        setStatus("loading");
        const response = await fetch("/api/notes", { signal: controller.signal });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Unable to load notes.");
        }

        setNotes(data.notes || []);
        setStatus("success");
      } catch (loadError) {
        if (loadError.name === "AbortError") {
          return;
        }

        setMessage({ status: "error", message: loadError.message || "Unable to load notes." });
        setStatus("error");
      }
    }

    loadNotes();
    return () => controller.abort();
  }, []);

  // Creates a blank note, then opens it in edit mode.
  async function handleCreateNote() {
    try {
      setMessage({ status: "loading", message: "Creating note..." });
      const response = await fetch("/api/notes", { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to create note.");
      }

      setNotes((current) => [data.note, ...current]);
      openNote(data.note);
      setMessage({ status: "success", message: data.message || "Note created successfully." });
    } catch (createError) {
      setMessage({ status: "error", message: createError.message || "Unable to create note." });
    }
  }

  function openNote(note) {
    setSelectedNote(note);
    setForm({ title: note.title, content: note.content || "" });
    setMode("view");
  }

  function returnToList() {
    setSelectedNote(null);
    setForm({ title: "", content: "" });
    setMode("list");
  }

  function startEditing() {
    setForm({
      title: selectedNote?.title || "Untitled Note",
      content: selectedNote?.content || ""
    });
    setMode("edit");
  }

  // Saves title and content changes for the selected note.
  async function handleSaveNote() {
    if (!selectedNote?.id) {
      return;
    }

    try {
      setMessage({ status: "loading", message: "Saving note..." });
      const response = await fetch(`/api/notes/${selectedNote.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to save note.");
      }

      setSelectedNote(data.note);
      setNotes((current) => current.map((note) => note.id === data.note.id ? data.note : note));
      setMode("view");
      setMessage({ status: "success", message: data.message || "Note saved successfully." });
    } catch (saveError) {
      setMessage({ status: "error", message: saveError.message || "Unable to save note." });
    }
  }

  // Deletes the selected note after confirmation.
  async function handleDeleteNote() {
    if (!selectedNote?.id) {
      return;
    }

    try {
      setMessage({ status: "loading", message: "Deleting note..." });
      const response = await fetch(`/api/notes/${selectedNote.id}`, { method: "DELETE" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to delete note.");
      }

      setNotes((current) => current.filter((note) => note.id !== selectedNote.id));
      setDeleteConfirmOpen(false);
      returnToList();
      setMessage({ status: "success", message: data.message || "Note deleted successfully." });
    } catch (deleteError) {
      setDeleteConfirmOpen(false);
      setMessage({ status: "error", message: deleteError.message || "Unable to delete note." });
    }
  }

  // Exports the selected note as a local PDF file.
  function handleExportNotePdf() {
    if (!selectedNote) {
      return;
    }

    try {
      exportNotePdf(selectedNote);
      setMessage({ status: "success", message: "Note PDF downloaded." });
    } catch {
      setMessage({ status: "error", message: "Unable to export note PDF." });
    }
  }

  if (status === "loading") {
    return <LoadingBanner title="Loading notes" detail="Opening your revision notebook." />;
  }

  return (
    <div className="notes-page">
      <header className="notes-header">
        <div>
          <span className="summary-section-label">Revision Notebook</span>
          <h1>Notes</h1>
        </div>
        {mode === "list" && (
          <LoadingButton
            className="notes-primary-action"
            isLoading={message.status === "loading"}
            loadingLabel="Creating note"
            onClick={handleCreateNote}
            type="button"
          >
            <Plus size={18} />
            <span>New Note</span>
          </LoadingButton>
        )}
      </header>

      {message.status !== "idle" && message.status !== "loading" && (
        <div className={`summary-export-status ${message.status}`}>
          <span>{message.message}</span>
        </div>
      )}

      {mode === "list" && (
        <section className="notes-list-panel">
          {notes.length ? (
            <div className="notes-list" aria-label="Personal notes">
              {notes.map((note) => (
                <button key={note.id} type="button" onClick={() => openNote(note)}>
                  <FileText size={19} />
                  <span>{note.title}</span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyPanel
              title="No notes yet."
              text="Create a blank note to start your personal revision notebook."
            />
          )}
        </section>
      )}

      {mode !== "list" && selectedNote && (
        <section className="note-workspace">
          {mode === "view" ? (
            <>
              <button className="note-back-button" type="button" onClick={returnToList}>
                <ArrowLeft size={17} />
                Back to Notes
              </button>
              <div className="note-workspace-heading">
                <h2>{selectedNote.title}</h2>
                <div>
                  <button
                    aria-label={`Export ${selectedNote.title} as PDF`}
                    title="Export note as PDF"
                    type="button"
                    onClick={handleExportNotePdf}
                  >
                    <Download size={17} />
                    <span>PDF</span>
                  </button>
                  <button type="button" onClick={startEditing}>
                    <Pencil size={17} />
                    <span>Edit</span>
                  </button>
                  <button className="danger" type="button" onClick={() => setDeleteConfirmOpen(true)}>
                    <Trash2 size={17} />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
              <div className="note-content-view">
                {selectedNote.content || "This note is empty."}
              </div>
            </>
          ) : (
            <div className="note-editor">
              <label>
                <span>Title</span>
                <input
                  maxLength={120}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  type="text"
                  value={form.title}
                />
              </label>
              <label>
                <span>Content</span>
                <textarea
                  onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
                  value={form.content}
                />
              </label>
              <LoadingButton
                className="notes-primary-action"
                isLoading={message.status === "loading"}
                loadingLabel="Saving note"
                onClick={handleSaveNote}
                type="button"
              >
                <Save size={17} />
                <span>Save</span>
              </LoadingButton>
            </div>
          )}
        </section>
      )}

      {deleteConfirmOpen && selectedNote && (
        <ConfirmationModal
          title="Delete this note?"
          message={`"${selectedNote.title}" will be permanently deleted.`}
          isConfirming={message.status === "loading"}
          onCancel={() => setDeleteConfirmOpen(false)}
          onConfirm={handleDeleteNote}
        />
      )}
    </div>
  );
}

export default NotesPage;
