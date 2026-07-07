import React, { useRef } from "react";
import { Upload } from "lucide-react";
import { useAutoDismissStatus } from "../utils/hooks.js";
import { LoadingBanner, LoadingSpinner } from "./Loading.jsx";

// Dashboard header with the quick PDF upload entry point.
export default function Header({ user, uploadState, setUploadState }) {
  const firstName = user.name.split(" ")[0] || "Alex";
  const fileInputRef = useRef(null);
  useAutoDismissStatus(uploadState, setUploadState);

  // Uploads one dashboard PDF and opens its generated summary.
  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setUploadState({
        status: "error",
        message: "Please upload a PDF file."
      });
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      setUploadState({
        status: "loading",
        message: `Uploading ${file.name}...`
      });

      const response = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Upload failed.");
      }

      setUploadState({
        status: "success",
        message: "PDF uploaded and summary generated."
      });
      window.dispatchEvent(new Event("studymind:dashboard-refresh"));
      window.location.hash = `#summary?documentId=${data.document.id}`;
    } catch (uploadError) {
      setUploadState({
        status: "error",
        message: uploadError.message || "Upload failed. Please try again."
      });
    }
  }

  return (
    <>
      <header className="top-header">
        <div>
          <h1>Welcome back, {firstName}</h1>
          <p>Continue learning where you left off.</p>
        </div>

        <div className="header-actions">
          <input
            ref={fileInputRef}
            className="file-input"
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleFileChange}
          />
          <a className="how-link-button" href="#how-it-works">
            <span>How It Works</span>
          </a>
          <button
            className="upload-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadState.status === "loading"}
            type="button"
          >
            {uploadState.status === "loading" ? <LoadingSpinner size="sm" /> : <Upload size={18} />}
            <span>Upload</span>
          </button>
        </div>
      </header>
      {uploadState.status === "loading" && (
        <LoadingBanner
          title="Uploading PDF"
          detail="Analyzing content..."
        />
      )}
      {uploadState.status !== "idle" && uploadState.status !== "loading" && (
        <div className={`upload-status ${uploadState.status}`}>
          <span>{uploadState.message}</span>
        </div>
      )}
    </>
  );
}
