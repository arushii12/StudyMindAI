import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { jsPDF } from "jspdf";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  BarChart3,
  BookOpen,
  Bookmark,
  Brain,
  ChartNoAxesCombined,
  ChevronDown,
  Clock3,
  Download,
  FileText,
  Flame,
  Folder,
  GraduationCap,
  LayoutDashboard,
  Layers,
  LibraryBig,
  LineChart,
  MoreVertical,
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Target,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import "./styles.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const navigationItems = [
  { label: "Dashboard", icon: LayoutDashboard, page: "dashboard", href: "#dashboard" },
  { label: "Library", icon: LibraryBig, page: "library", href: "#library" },
  { label: "Summary", icon: FileText, page: "summary", href: "#summary" },
  { label: "Quizzes", icon: Brain, page: "quizzes", href: "#quizzes" },
  { label: "Flashcards", icon: BookOpen, page: "flashcards", href: "#flashcards" },
  { label: "Review", icon: Bookmark, page: "review", href: "#review" },
  { label: "Analytics", icon: BarChart3, page: "analytics", href: "#analytics" }
];

const statConfig = [
  { key: "documentsUploaded", label: "Documents Uploaded", icon: LibraryBig },
  { key: "quizAttempts", label: "Quiz Attempts", icon: Target },
  { key: "averageScore", label: "Average Score", icon: ChartNoAxesCombined, suffix: "%" },
  { key: "studyStreak", label: "Study Streak", icon: Flame, suffix: " Days" }
];

const insightIcons = {
  revision: Target,
  focus: Brain,
  activity: Clock3,
  improving: LineChart
};

function App() {
  const [page, setPage] = useState(getPageFromHash());
  const [dashboard, setDashboard] = useState(null);
  const [dashboardRefreshToken, setDashboardRefreshToken] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("sidebarCollapsed") === "true";
    } catch {
      return false;
    }
  });
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [uploadState, setUploadState] = useState({
    status: "idle",
    message: ""
  });
  const liveStudySeconds = useStudyActivityTracker(page);

  useEffect(() => {
    const handleHashChange = () => setPage(getPageFromHash());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    const handleDashboardRefresh = () => setDashboardRefreshToken((token) => token + 1);
    window.addEventListener("studymind:dashboard-refresh", handleDashboardRefresh);
    return () => window.removeEventListener("studymind:dashboard-refresh", handleDashboardRefresh);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("sidebarCollapsed", String(sidebarCollapsed));
    } catch {
      // Sidebar preference is nice-to-have; keep the UI working if storage is blocked.
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (page !== "dashboard") {
      return undefined;
    }

    const controller = new AbortController();

    async function loadDashboard() {
      try {
        setStatus("loading");
        setError("");
        const response = await fetch("/api/dashboard", { signal: controller.signal });

        if (!response.ok) {
          throw new Error(`Dashboard request failed with ${response.status}`);
        }

        const data = await response.json();
        setDashboard(data);
        setStatus("success");
      } catch (requestError) {
        if (requestError.name === "AbortError") {
          return;
        }

        setError(requestError.message || "Unable to load dashboard.");
        setStatus("error");
      }
    }

    loadDashboard();

    return () => controller.abort();
  }, [page, dashboardRefreshToken]);

  const user = dashboard?.user || {
    name: "Alex Morgan",
    email: "alex@studymind.ai"
  };

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <Sidebar
        user={user}
        activePage={page}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((value) => !value)}
      />
      <main className={`dashboard-main ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        {page === "summary" ? (
          <SummaryPage />
        ) : page === "library" ? (
          <LibraryPage />
        ) : page === "quizzes" ? (
          <QuizPage />
        ) : page === "flashcards" ? (
          <FlashcardsPage />
        ) : page === "review" ? (
          <ReviewPage />
        ) : (
          <>
            <Header user={user} uploadState={uploadState} setUploadState={setUploadState} />
            {status === "loading" && <DashboardSkeleton />}
            {status === "error" && <ErrorState message={error} />}
            {status === "success" && dashboard && (
              <DashboardContent dashboard={dashboard} liveStudySeconds={liveStudySeconds} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function getPageFromHash() {
  const hash = window.location.hash.replace("#", "").split("?")[0];
  return hash || "dashboard";
}

function getHashParams() {
  const query = window.location.hash.split("?")[1] || "";
  return new URLSearchParams(query);
}

function useStudyActivityTracker(page) {
  const [liveSeconds, setLiveSeconds] = useState(0);
  const lastActivityRef = useRef(Date.now());
  const lastTickRef = useRef(Date.now());
  const pendingSecondsRef = useRef(0);
  const sourceRef = useRef(page || "dashboard");

  useEffect(() => {
    sourceRef.current = page || "dashboard";
  }, [page]);

  useEffect(() => {
    function markActive() {
      lastActivityRef.current = Date.now();
    }

    async function flushActivity(useBeacon = false) {
      const durationSeconds = Math.floor(pendingSecondsRef.current);

      if (durationSeconds < 5) {
        return;
      }

      pendingSecondsRef.current = 0;
      const payload = JSON.stringify({
        durationSeconds,
        source: sourceRef.current
      });

      try {
        if (useBeacon && navigator.sendBeacon) {
          navigator.sendBeacon("/api/dashboard/activity", new Blob([payload], { type: "application/json" }));
        } else {
          await fetch("/api/dashboard/activity", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            keepalive: useBeacon
          });
        }

        setLiveSeconds(0);
        window.dispatchEvent(new Event("studymind:dashboard-refresh"));
      } catch {
        pendingSecondsRef.current += durationSeconds;
        setLiveSeconds(pendingSecondsRef.current);
      }
    }

    const activityEvents = ["mousemove", "keydown", "scroll", "click", "touchstart"];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, markActive, { passive: true }));
    markActive();

    const tick = window.setInterval(() => {
      const now = Date.now();
      const elapsedSeconds = Math.max(0, (now - lastTickRef.current) / 1000);
      lastTickRef.current = now;
      const active = document.visibilityState === "visible" && now - lastActivityRef.current < 2 * 60 * 1000;

      if (!active) {
        return;
      }

      pendingSecondsRef.current += elapsedSeconds;
      setLiveSeconds(pendingSecondsRef.current);

      if (pendingSecondsRef.current >= 5 * 60) {
        flushActivity(false);
      }
    }, 15000);

    function handlePageHide() {
      flushActivity(true);
    }

    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    return () => {
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, markActive));
      window.clearInterval(tick);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
      flushActivity(true);
    };
  }, []);

  return liveSeconds;
}

function Sidebar({ user, activePage, collapsed, onToggle }) {
  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="brand">
        <div className="brand-mark">
          <GraduationCap size={24} />
        </div>
        <span>StudyMind AI</span>
        <button
          className="sidebar-toggle"
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={onToggle}
        >
          {collapsed ? "▶" : "◀"}
        </button>
      </div>

      <nav className="sidebar-nav" aria-label="Primary navigation">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          return (
            <a
              className={`nav-item ${item.page === activePage ? "active" : ""}`}
              data-tooltip={item.label}
              href={item.href}
              key={item.label}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>

      <div className="profile-card" data-tooltip={`${user.name} - ${user.email}`}>
        <div className="avatar">{initials}</div>
        <div>
          <strong>{user.name}</strong>
          <span>{user.email}</span>
        </div>
      </div>
    </aside>
  );
}

function Header({ user, uploadState, setUploadState }) {
  const firstName = user.name.split(" ")[0] || "Alex";
  const fileInputRef = useRef(null);

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
          <button
            className="upload-button"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadState.status === "loading"}
          >
            <Upload size={18} />
            <span>{uploadState.status === "loading" ? "Uploading" : "Upload"}</span>
          </button>
        </div>
      </header>
      {uploadState.status !== "idle" && (
        <div className={`upload-status ${uploadState.status}`}>
          <span>{uploadState.message}</span>
        </div>
      )}
    </>
  );
}

function LibraryPage() {
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [folderDocuments, setFolderDocuments] = useState([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState([]);
  const [moveTargetId, setMoveTargetId] = useState("");
  const [status, setStatus] = useState("loading");
  const [detailStatus, setDetailStatus] = useState("idle");
  const [message, setMessage] = useState({ type: "idle", text: "" });
  const [uploadState, setUploadState] = useState("idle");
  const [aiAction, setAiAction] = useState("idle");
  const [activePdf, setActivePdf] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadFolders();
  }, []);

  async function loadFolders() {
    try {
      setStatus("loading");
      const response = await fetch("/api/folders");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to load folders.");
      }

      setFolders(data.folders || []);
      setStatus("success");
    } catch (requestError) {
      setMessage({ type: "error", text: requestError.message || "Unable to load folders." });
      setStatus("error");
    }
  }

  async function openFolder(folder) {
    try {
      setSelectedFolder(folder);
      setDetailStatus("loading");
      const response = await fetch(`/api/folders/${folder.id}/documents`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to load folder documents.");
      }

      setSelectedFolder(data.folder);
      setFolderDocuments(data.documents || []);
      setSelectedDocumentIds([]);
      setMoveTargetId("");
      setDetailStatus("success");
    } catch (requestError) {
      setMessage({ type: "error", text: requestError.message || "Unable to open folder." });
      setDetailStatus("error");
    }
  }

  async function createFolder() {
    const name = window.prompt("Folder name");

    if (!name?.trim()) {
      return;
    }

    try {
      const response = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to create folder.");
      }

      setMessage({ type: "success", text: "Folder created." });
      await loadFolders();
    } catch (requestError) {
      setMessage({ type: "error", text: requestError.message || "Unable to create folder." });
    }
  }

  async function renameFolder(folder) {
    const name = window.prompt("Rename folder", folder.name);

    if (!name?.trim() || name.trim() === folder.name) {
      return;
    }

    try {
      const response = await fetch(`/api/folders/${folder.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to rename folder.");
      }

      setMessage({ type: "success", text: "Folder renamed." });
      await loadFolders();

      if (selectedFolder?.id === folder.id) {
        await openFolder(data.folder);
      }
    } catch (requestError) {
      setMessage({ type: "error", text: requestError.message || "Unable to rename folder." });
    }
  }

  async function deleteFolder(folder) {
    const shouldDelete = window.confirm(`Delete "${folder.name}"? Folders with PDFs cannot be deleted.`);

    if (!shouldDelete) {
      return;
    }

    try {
      const response = await fetch(`/api/folders/${folder.id}`, {
        method: "DELETE"
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to delete folder.");
      }

      setMessage({ type: "success", text: "Folder deleted." });

      if (selectedFolder?.id === folder.id) {
        setSelectedFolder(null);
        setFolderDocuments([]);
      }

      await loadFolders();
    } catch (requestError) {
      setMessage({ type: "error", text: requestError.message || "Unable to delete folder." });
    }
  }

  async function uploadFiles(files) {
    if (!selectedFolder) {
      setMessage({ type: "error", text: "Open a folder before uploading PDFs." });
      return;
    }

    const pdfs = Array.from(files || []);

    if (!pdfs.length) {
      return;
    }

    if (pdfs.some((file) => file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"))) {
      setMessage({ type: "error", text: "Please upload a PDF file." });
      return;
    }

    try {
      setUploadState("loading");
      setMessage({ type: "idle", text: `Uploading ${pdfs.length} PDF${pdfs.length === 1 ? "" : "s"}...` });

      for (const file of pdfs) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("folderId", selectedFolder.id);

        const response = await fetch("/api/documents/upload", {
          method: "POST",
          body: formData
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Upload failed.");
        }
      }

      setMessage({ type: "success", text: "PDF uploaded to folder." });
      await Promise.all([loadFolders(), openFolder(selectedFolder)]);
    } catch (uploadError) {
      setMessage({ type: "error", text: uploadError.message || "Upload failed." });
    } finally {
      setUploadState("idle");
    }
  }

  async function handlePdfUpload(event) {
    await uploadFiles(event.target.files);
    event.target.value = "";
  }

  async function moveDocuments(documentIds, destinationFolderId = moveTargetId) {
    if (!documentIds.length) {
      setMessage({ type: "error", text: "Select at least one PDF to move." });
      return;
    }

    if (!destinationFolderId) {
      setMessage({ type: "error", text: "Choose a destination folder." });
      return;
    }

    try {
      const response = await fetch("/api/documents/move", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds, folderId: destinationFolderId })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to move PDFs.");
      }

      setMessage({ type: "success", text: data.message || "PDFs moved." });
      await Promise.all([loadFolders(), openFolder(selectedFolder)]);
    } catch (requestError) {
      setMessage({ type: "error", text: requestError.message || "Unable to move PDFs." });
    }
  }

  async function deleteDocuments(documentIds) {
    if (!documentIds.length) {
      setMessage({ type: "error", text: "Select at least one PDF to delete." });
      return;
    }

    const shouldDelete = window.confirm(`Delete ${documentIds.length} PDF${documentIds.length === 1 ? "" : "s"} from this folder?`);

    if (!shouldDelete) {
      return;
    }

    try {
      const response = await fetch("/api/documents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to delete PDFs.");
      }

      setMessage({ type: "success", text: data.message || "PDFs deleted." });
      await Promise.all([loadFolders(), openFolder(selectedFolder)]);
    } catch (requestError) {
      setMessage({ type: "error", text: requestError.message || "Unable to delete PDFs." });
    }
  }

  async function generateFromSelected(type) {
    if (!selectedDocumentIds.length) {
      setMessage({ type: "error", text: "Select at least one PDF first." });
      return;
    }

    const config = {
      summary: {
        endpoint: "/api/summaries/generate",
        loading: "Generating summary from selected PDFs...",
        success: "Summary generated from selected PDFs."
      },
      quiz: {
        endpoint: "/api/quizzes/generate",
        loading: "Generating quiz from selected PDFs...",
        success: "Quiz generated from selected PDFs."
      },
      flashcards: {
        endpoint: "/api/flashcards/generate",
        loading: "Generating flashcards from selected PDFs...",
        success: "Flashcards generated from selected PDFs."
      }
    }[type];

    try {
      setAiAction(type);
      setMessage({ type: "idle", text: config.loading });
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentIds: selectedDocumentIds,
          folderId: selectedFolder.id
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "AI generation failed.");
      }

      setMessage({ type: "success", text: config.success });

      if (type === "summary") {
        window.location.hash = `#summary?documentId=${data.document.id}`;
      } else if (type === "quiz") {
        window.location.hash = `#quizzes?documentId=${data.document.id}&quizId=${data.quiz.id}`;
      } else {
        window.location.hash = `#flashcards?documentId=${data.document.id}&setId=${data.flashcardSet.id}`;
      }
    } catch (requestError) {
      setMessage({ type: "error", text: requestError.message || "AI generation failed." });
    } finally {
      setAiAction("idle");
    }
  }

  return (
    <div className="library-page">
      <header className="library-header">
        <div>
          <span className="summary-breadcrumb">Library</span>
          <h1>Study Library</h1>
          <p>Organize uploaded PDFs into subject folders.</p>
        </div>

        <div className="library-actions">
          <input
            ref={fileInputRef}
            className="file-input"
            type="file"
            accept="application/pdf,.pdf"
            multiple
            onChange={handlePdfUpload}
          />
          <button
            className="upload-button"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadState === "loading"}
          >
            <Upload size={18} />
            <span>{uploadState === "loading" ? "Uploading" : "Upload PDFs"}</span>
          </button>
          <button className="library-secondary-action" type="button" onClick={createFolder}>
            <Plus size={18} />
            <span>New Folder</span>
          </button>
        </div>
      </header>

      {message.text && (
        <div className={`library-message ${message.type}`}>
          {message.text}
        </div>
      )}

      {selectedFolder ? (
        <FolderDetailView
          documents={folderDocuments}
          folders={folders}
          folder={selectedFolder}
          moveTargetId={moveTargetId}
          onBack={() => {
            setSelectedFolder(null);
            setFolderDocuments([]);
            setSelectedDocumentIds([]);
            setMoveTargetId("");
          }}
          onDelete={deleteFolder}
          onDeleteDocuments={deleteDocuments}
          onMoveDocuments={moveDocuments}
          onRename={renameFolder}
          onGenerateSelected={generateFromSelected}
          onSelectDocuments={setSelectedDocumentIds}
          onSetMoveTarget={setMoveTargetId}
          onUploadFiles={uploadFiles}
          onViewPdf={setActivePdf}
          selectedDocumentIds={selectedDocumentIds}
          status={detailStatus}
          aiAction={aiAction}
          uploadState={uploadState}
        />
      ) : (
        <FolderGrid
          folders={folders}
          onDelete={deleteFolder}
          onOpen={openFolder}
          onRename={renameFolder}
          status={status}
        />
      )}
      {activePdf && (
        <PdfViewerModal
          document={activePdf}
          onClose={() => setActivePdf(null)}
        />
      )}
    </div>
  );
}

function FolderGrid({ folders, onDelete, onOpen, onRename, status }) {
  if (status === "loading") {
    return (
      <section className="folder-grid">
        {[0, 1, 2].map((item) => (
          <div className="folder-card skeleton-panel" key={item} />
        ))}
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="state-card">
        <strong>Folders could not load.</strong>
        <p>Check the backend connection and try again.</p>
      </section>
    );
  }

  if (!folders.length) {
    return (
      <section className="library-empty panel">
        <EmptyPanel
          title="No folders yet."
          text="Create a subject folder to start organizing your study PDFs."
        />
      </section>
    );
  }

  return (
    <section className="folder-grid" aria-label="Subject folders">
      {folders.map((folder) => (
        <article className="folder-card" key={folder.id}>
          <button className="folder-open-button" type="button" onClick={() => onOpen(folder)}>
            <div className="folder-icon">
              <Folder size={28} />
            </div>
            <div>
              <h2>{folder.name}</h2>
              <p>{folder.documentCount} {folder.documentCount === 1 ? "PDF" : "PDFs"}</p>
              <span>{formatRelativeTimestamp(folder.updatedAt)}</span>
            </div>
          </button>
          <details className="folder-menu">
            <summary aria-label={`Actions for ${folder.name}`}>
              <MoreVertical size={18} />
            </summary>
            <div>
              <button type="button" onClick={() => onRename(folder)}>
                <Pencil size={15} />
                <span>Rename Folder</span>
              </button>
              <button type="button" onClick={() => onDelete(folder)}>
                <Trash2 size={15} />
                <span>Delete Folder</span>
              </button>
            </div>
          </details>
        </article>
      ))}
    </section>
  );
}

function FolderDetailView({
  aiAction,
  documents,
  folders,
  folder,
  moveTargetId,
  onBack,
  onDelete,
  onDeleteDocuments,
  onGenerateSelected,
  onMoveDocuments,
  onRename,
  onSelectDocuments,
  onSetMoveTarget,
  onUploadFiles,
  onViewPdf,
  selectedDocumentIds,
  status,
  uploadState
}) {
  const selectableDocuments = documents.map((document) => document.documentId);
  const allSelected = selectableDocuments.length > 0
    && selectableDocuments.every((id) => selectedDocumentIds.includes(id));
  const destinationFolders = folders.filter((item) => item.id !== folder.id);

  function toggleDocument(id) {
    onSelectDocuments(
      selectedDocumentIds.includes(id)
        ? selectedDocumentIds.filter((selectedId) => selectedId !== id)
        : [...selectedDocumentIds, id]
    );
  }

  function toggleAll() {
    onSelectDocuments(allSelected ? [] : selectableDocuments);
  }

  function handleDrop(event) {
    event.preventDefault();
    onUploadFiles(event.dataTransfer.files);
  }

  return (
    <section className="folder-detail">
      <div className="folder-detail-heading">
        <button className="folder-back-button" type="button" onClick={onBack}>
          Back to folders
        </button>
        <div>
          <h2>{folder.name}</h2>
          <p>{folder.documentCount} {folder.documentCount === 1 ? "PDF" : "PDFs"}</p>
        </div>
        <div className="folder-detail-actions">
          <button type="button" onClick={() => onRename(folder)}>
            <Pencil size={16} />
            <span>Rename</span>
          </button>
          <button type="button" onClick={() => onDelete(folder)}>
            <Trash2 size={16} />
            <span>Delete</span>
          </button>
        </div>
      </div>

      <div
        className="folder-upload-zone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <div>
          <strong>Upload PDFs into {folder.name}</strong>
          <span>Drag and drop PDFs here, or use the Upload PDFs button above.</span>
        </div>
        <button type="button" onClick={() => document.querySelector(".library-actions .file-input")?.click()}>
          <Upload size={17} />
          <span>{uploadState === "loading" ? "Uploading" : "Upload PDF"}</span>
        </button>
      </div>

      {status === "loading" ? (
        <div className="pdf-table-card skeleton-panel" />
      ) : documents.length ? (
        <>
          <div className="pdf-selection-toolbar">
            <div>
              <button type="button" onClick={toggleAll}>
                {allSelected ? "Deselect All" : "Select All"}
              </button>
              <span>Selected: {selectedDocumentIds.length} file{selectedDocumentIds.length === 1 ? "" : "s"}</span>
            </div>
            <div className="pdf-ai-actions">
              <button type="button" onClick={() => onGenerateSelected("summary")} disabled={!selectedDocumentIds.length || aiAction !== "idle"}>
                {aiAction === "summary" ? "Generating" : "Generate Summary"}
              </button>
              <button type="button" onClick={() => onGenerateSelected("quiz")} disabled={!selectedDocumentIds.length || aiAction !== "idle"}>
                {aiAction === "quiz" ? "Generating" : "Generate Quiz"}
              </button>
              <button type="button" onClick={() => onGenerateSelected("flashcards")} disabled={!selectedDocumentIds.length || aiAction !== "idle"}>
                {aiAction === "flashcards" ? "Generating" : "Generate Flashcards"}
              </button>
            </div>
            <div>
              <select
                aria-label="Move selected PDFs to folder"
                onChange={(event) => onSetMoveTarget(event.target.value)}
                value={moveTargetId}
              >
                <option value="">Move to folder...</option>
                {destinationFolders.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
              <button type="button" onClick={() => onMoveDocuments(selectedDocumentIds)} disabled={!selectedDocumentIds.length || !moveTargetId}>
                Move Selected
              </button>
              <button type="button" onClick={() => onDeleteDocuments(selectedDocumentIds)} disabled={!selectedDocumentIds.length}>
                Delete Selected
              </button>
            </div>
          </div>
          <div className="pdf-table-card">
            <table className="pdf-table">
              <thead>
                <tr>
                  <th>
                    <input
                      aria-label="Select all PDFs"
                      checked={allSelected}
                      onChange={toggleAll}
                      type="checkbox"
                    />
                  </th>
                  <th>File Name</th>
                  <th>Pages</th>
                  <th>Size</th>
                  <th>Uploaded On</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((document) => (
                  <tr className={selectedDocumentIds.includes(document.documentId) ? "selected" : ""} key={document.id}>
                    <td>
                      <input
                        aria-label={`Select ${document.fileName}`}
                        checked={selectedDocumentIds.includes(document.documentId)}
                        onChange={() => toggleDocument(document.documentId)}
                        type="checkbox"
                      />
                    </td>
                    <td>
                      <a href={`#summary?documentId=${document.documentId}`}>{document.fileName}</a>
                    </td>
                    <td>{document.pageCount || "—"}</td>
                    <td>{formatFileSize(document.fileSize)}</td>
                    <td>{formatDate(document.uploadDate)}</td>
                    <td>
                      <div className="pdf-row-actions">
                        <button type="button" onClick={() => onViewPdf(document)}>View PDF</button>
                        <a href={`#summary?documentId=${document.documentId}`}>Summary</a>
                        <select
                          aria-label={`Move ${document.fileName}`}
                          onChange={(event) => {
                            if (event.target.value) {
                              onMoveDocuments([document.documentId], event.target.value);
                              event.target.value = "";
                            }
                          }}
                        >
                          <option value="">Move</option>
                          {destinationFolders.map((item) => (
                            <option key={item.id} value={item.id}>{item.name}</option>
                          ))}
                        </select>
                        <button type="button" onClick={() => onDeleteDocuments([document.documentId])}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="pdf-table-card">
          <div className="folder-pdf-empty">
            <EmptyPanel
              title="No PDFs uploaded yet."
              text="Use Upload PDFs to add study material to this folder."
            />
            <button type="button" onClick={() => document.querySelector(".library-actions .file-input")?.click()}>
              <Upload size={17} />
              <span>Upload PDF</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function ReviewPage() {
  const [summaryGroups, setSummaryGroups] = useState([]);
  const [questionGroups, setQuestionGroups] = useState([]);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState({ type: "idle", text: "" });
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [activeTab, setActiveTab] = useState("summaries");

  useEffect(() => {
    loadReviewData();
  }, []);

  async function loadReviewData() {
    try {
      setStatus("loading");
      const [summaryResponse, questionResponse] = await Promise.all([
        fetch("/api/review/summaries"),
        fetch("/api/review/questions")
      ]);
      const [summaryData, questionData] = await Promise.all([
        summaryResponse.json(),
        questionResponse.json()
      ]);

      if (!summaryResponse.ok) {
        throw new Error(summaryData.message || "Unable to load saved summaries.");
      }

      if (!questionResponse.ok) {
        throw new Error(questionData.message || "Unable to load marked questions.");
      }

      setSummaryGroups(summaryData.folders || []);
      setQuestionGroups(questionData.folders || []);
      setStatus("success");
    } catch (requestError) {
      setMessage({ type: "error", text: requestError.message || "Unable to load Review Center." });
      setStatus("error");
    }
  }

  async function removeSavedSummary(id) {
    await removeReviewItem(`/api/review/summaries/${id}`, "Saved summary removed.");
  }

  async function removeMarkedQuestion(id) {
    await removeReviewItem(`/api/review/questions/${id}`, "Marked question removed.");
  }

  async function removeReviewItem(endpoint, fallbackMessage) {
    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to remove review item.");
      }

      setMessage({ type: "success", text: data.message || fallbackMessage });
      await loadReviewData();
    } catch (requestError) {
      setMessage({ type: "error", text: requestError.message || "Unable to remove review item." });
    }
  }

  const folderCards = buildReviewFolderCards(summaryGroups, questionGroups);
  const currentFolder = selectedFolder
    ? folderCards.find((folder) => folder.key === selectedFolder.key) || selectedFolder
    : null;
  const folderSummaries = selectedFolder
    ? findReviewGroup(summaryGroups, selectedFolder.key, "savedSummaries")
    : [];
  const folderQuestions = selectedFolder
    ? findReviewGroup(questionGroups, selectedFolder.key, "markedQuestions")
    : [];

  return (
    <div className="review-page">
      <header className="review-header">
        <div>
          <span className="summary-breadcrumb">Review</span>
          <h1>{currentFolder ? currentFolder.folderName : "Review Center"}</h1>
          <p>{currentFolder ? "Review saved content from this folder." : "Review your saved summaries and marked questions"}</p>
        </div>
        {currentFolder && (
          <button
            className="review-back-button"
            type="button"
            onClick={() => {
              setSelectedFolder(null);
              setActiveTab("summaries");
            }}
          >
            ← Back to Review Center
          </button>
        )}
      </header>

      {message.text && (
        <div className={`library-message ${message.type}`}>
          {message.text}
        </div>
      )}

      {status === "loading" ? (
        <div className="review-folder-grid">
          <div className="review-folder-card skeleton-panel" />
          <div className="review-folder-card skeleton-panel" />
          <div className="review-folder-card skeleton-panel" />
        </div>
      ) : !currentFolder ? (
        folderCards.length ? (
          <section className="review-folder-grid" aria-label="Review folders">
            {folderCards.map((folder) => (
              <button
                className="review-folder-card"
                key={folder.key}
                type="button"
                onClick={() => {
                  setSelectedFolder(folder);
                  setActiveTab("summaries");
                }}
              >
                <div className="review-folder-icon">
                  <Folder size={24} />
                </div>
                <div>
                  <h2>{folder.folderName}</h2>
                  <span>Saved Summaries: {folder.savedSummaryCount}</span>
                  <span>Marked Questions: {folder.markedQuestionCount}</span>
                </div>
              </button>
            ))}
          </section>
        ) : (
          <section className="review-empty-home">
            <EmptyPanel
              title="No review folders yet."
              text="Save summaries or mark quiz questions to build your Review Center."
            />
          </section>
        )
      ) : (
        <section className="review-folder-page">
          <div className="review-tabs" role="tablist" aria-label="Review folder content">
            <button
              className={activeTab === "summaries" ? "active" : ""}
              type="button"
              onClick={() => setActiveTab("summaries")}
            >
              Saved Summaries
            </button>
            <button
              className={activeTab === "questions" ? "active" : ""}
              type="button"
              onClick={() => setActiveTab("questions")}
            >
              Marked Questions
            </button>
          </div>

          {activeTab === "summaries" ? (
            folderSummaries.length ? (
              <div className="review-item-list">
                {folderSummaries.map((summary) => (
                  <article className="review-summary-row" key={summary.id}>
                    <div>
                      <strong>{summary.summaryTitle}</strong>
                      <span>Saved: {formatDate(summary.savedAt)}</span>
                    </div>
                    <div className="review-row-actions">
                      <a href={`#summary?documentId=${summary.documentId}`}>Open</a>
                      <button type="button" onClick={() => exportSummaryPdf({
                        document: { title: summary.summaryTitle, fileType: "pdf" },
                        summary: { updatedAt: summary.savedAt },
                        length: summary.summaryLength,
                        summaryText: summary.summaryText,
                        questions: []
                      })}>
                        Download PDF
                      </button>
                      <button type="button" onClick={() => removeSavedSummary(summary.id)}>Remove</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyPanel
                title="No saved summaries in this folder."
                text="Open a Summary page from this subject and save it for revision."
              />
            )
          ) : (
            folderQuestions.length ? (
              <div className="review-item-list">
                {folderQuestions.map((question) => (
                  <article className="review-question-card" key={question.id}>
                    <strong>Question: {question.questionText}</strong>
                    <div className="review-answer-grid">
                      <span>Your Answer: {formatQuizAnswer(question.options, question.userAnswer)}</span>
                      <span>Correct Answer: {formatQuizAnswer(question.options, question.correctAnswer)}</span>
                    </div>
                    <p>Explanation: {question.explanation}</p>
                    <small>Marked {formatDate(question.markedAt)}</small>
                    <div className="review-row-actions">
                      <a href={question.documentId ? `#quizzes?documentId=${question.documentId}&quizId=${question.quizId}` : "#quizzes"}>Retake</a>
                      <button type="button" onClick={() => removeMarkedQuestion(question.id)}>Remove</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyPanel
                title="No marked questions in this folder."
                text="Mark questions from this subject's quizzes to review them later."
              />
            )
          )}
        </section>
      )}
    </div>
  );
}

function PdfViewerModal({ document, onClose }) {
  const [pdfDocument, setPdfDocument] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [scale, setScale] = useState(1.05);
  const [currentPage, setCurrentPage] = useState(1);
  const pageRefs = useRef([]);
  const viewerRef = useRef(null);
  const pdfUrl = `/api/documents/${document.documentId}/pdf`;
  const downloadUrl = `${pdfUrl}?download=1`;

  useEffect(() => {
    let cancelled = false;
    const loadingTask = pdfjsLib.getDocument(pdfUrl);

    async function loadPdf() {
      try {
        setStatus("loading");
        setError("");
        const loadedPdf = await loadingTask.promise;

        if (cancelled) {
          loadedPdf.destroy();
          return;
        }

        setPdfDocument(loadedPdf);
        setCurrentPage(1);
        setStatus("success");
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Unable to open this PDF. The original file may be missing.");
          setStatus("error");
        }
      }
    }

    loadPdf();

    return () => {
      cancelled = true;
      loadingTask.destroy();
    };
  }, [pdfUrl]);

  useEffect(() => {
    function handleKeydown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [onClose]);

  function goToPage(pageNumber) {
    const nextPage = Math.min(Math.max(pageNumber, 1), pdfDocument?.numPages || 1);
    setCurrentPage(nextPage);
    pageRefs.current[nextPage - 1]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleScroll() {
    if (!viewerRef.current || !pdfDocument) {
      return;
    }

    const viewerTop = viewerRef.current.getBoundingClientRect().top;
    const closest = pageRefs.current.reduce((best, page, index) => {
      if (!page) {
        return best;
      }

      const distance = Math.abs(page.getBoundingClientRect().top - viewerTop - 12);
      return distance < best.distance ? { pageNumber: index + 1, distance } : best;
    }, { pageNumber: currentPage, distance: Number.POSITIVE_INFINITY });

    if (closest.pageNumber !== currentPage) {
      setCurrentPage(closest.pageNumber);
    }
  }

  return (
    <div className="pdf-viewer-overlay" role="dialog" aria-modal="true" aria-label="PDF viewer">
      <section className="pdf-viewer-modal">
        <header className="pdf-viewer-header">
          <div>
            <span className="summary-breadcrumb">Original PDF</span>
            <h2>{document.fileName || document.title}</h2>
          </div>
          <div className="pdf-viewer-actions">
            <button type="button" onClick={() => goToPage(currentPage - 1)} disabled={!pdfDocument || currentPage <= 1}>
              Previous
            </button>
            <span>{pdfDocument ? `${currentPage} / ${pdfDocument.numPages}` : "Loading"}</span>
            <button type="button" onClick={() => goToPage(currentPage + 1)} disabled={!pdfDocument || currentPage >= pdfDocument.numPages}>
              Next
            </button>
            <button type="button" onClick={() => setScale((value) => Math.max(0.65, Number((value - 0.15).toFixed(2))))} aria-label="Zoom out">
              <ZoomOut size={17} />
            </button>
            <button type="button" onClick={() => setScale((value) => Math.min(2.2, Number((value + 0.15).toFixed(2))))} aria-label="Zoom in">
              <ZoomIn size={17} />
            </button>
            <a href={downloadUrl}>
              <Download size={17} />
              <span>Download</span>
            </a>
            <button type="button" onClick={onClose} aria-label="Close PDF viewer">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="pdf-viewer-body" ref={viewerRef} onScroll={handleScroll}>
          {status === "loading" && (
            <div className="pdf-viewer-state">
              <strong>Loading original PDF...</strong>
              <p>Preparing pages for viewing.</p>
            </div>
          )}
          {status === "error" && (
            <div className="pdf-viewer-state error">
              <strong>PDF could not be opened.</strong>
              <p>{error}</p>
            </div>
          )}
          {status === "success" && pdfDocument && (
            <div className="pdf-page-stack">
              {Array.from({ length: pdfDocument.numPages }, (_, index) => (
                <div
                  className="pdf-page-shell"
                  key={index + 1}
                  ref={(node) => {
                    pageRefs.current[index] = node;
                  }}
                >
                  <span>Page {index + 1}</span>
                  <PdfCanvasPage pdfDocument={pdfDocument} pageNumber={index + 1} scale={scale} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function PdfCanvasPage({ pdfDocument, pageNumber, scale }) {
  const canvasRef = useRef(null);
  const [renderError, setRenderError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let renderTask;

    async function renderPage() {
      try {
        setRenderError("");
        const page = await pdfDocument.getPage(pageNumber);

        if (cancelled) {
          return;
        }

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;

        if (!canvas) {
          return;
        }

        const context = canvas.getContext("2d");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        renderTask = page.render({ canvasContext: context, viewport });
        await renderTask.promise;
      } catch (pageError) {
        if (!cancelled && pageError?.name !== "RenderingCancelledException") {
          setRenderError("This page could not render.");
        }
      }
    }

    renderPage();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdfDocument, pageNumber, scale]);

  return (
    <>
      <canvas ref={canvasRef} />
      {renderError && <small>{renderError}</small>}
    </>
  );
}

function SummaryPage() {
  const documentId = getHashParams().get("documentId");
  const [summaryData, setSummaryData] = useState(null);
  const [length, setLength] = useState("short");
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [quizGeneration, setQuizGeneration] = useState({
    status: "idle",
    message: ""
  });
  const [flashcardGeneration, setFlashcardGeneration] = useState({
    status: "idle",
    message: ""
  });
  const [pdfExportState, setPdfExportState] = useState({
    status: "idle",
    message: ""
  });
  const [savedSummary, setSavedSummary] = useState(null);
  const [saveSummaryState, setSaveSummaryState] = useState({
    status: "idle",
    message: ""
  });
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatStatus, setChatStatus] = useState("idle");
  const [chatError, setChatError] = useState("");
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const chatRef = useRef(null);
  const chatScrollPositions = useRef({ compact: 0, expanded: 0 });

  useEffect(() => {
    const controller = new AbortController();

    async function loadSummary() {
      try {
        setStatus("loading");
        const params = new URLSearchParams({ length });

        if (documentId) {
          params.set("documentId", documentId);
        }

        const response = await fetch(`/api/summaries?${params.toString()}`, {
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`Summary request failed with ${response.status}`);
        }

        const data = await response.json();
        setSummaryData(data);
        setStatus("success");
      } catch (requestError) {
        if (requestError.name === "AbortError") {
          return;
        }

        setError(requestError.message || "Unable to load summary.");
        setStatus("error");
      }
    }

    loadSummary();

    return () => controller.abort();
  }, [length, documentId]);

  useEffect(() => {
    setChatMessages([]);
    setChatInput("");
    setChatStatus("idle");
    setChatError("");
  }, [documentId]);

  useEffect(() => {
    if (!summaryData?.document?.id || !summaryData?.summary) {
      setSavedSummary(null);
      return;
    }

    let cancelled = false;

    async function loadSavedState() {
      try {
        const response = await fetch("/api/review/summaries");
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Unable to load saved summaries.");
        }

        const saved = (data.summaries || []).find((item) => (
          item.documentId === summaryData.document.id
          && item.summaryLength === length
          && (!summaryData.summary.id || item.summaryId === summaryData.summary.id)
        ));

        if (!cancelled) {
          setSavedSummary(saved || null);
        }
      } catch {
        if (!cancelled) {
          setSavedSummary(null);
        }
      }
    }

    loadSavedState();

    return () => {
      cancelled = true;
    };
  }, [summaryData?.document?.id, summaryData?.summary?.id, length]);

  async function handleGenerate() {
    try {
      setIsRegenerating(true);
      const endpoint = summaryData?.summary?.id && summaryData.summary.id !== "placeholder-summary"
        ? `/api/summaries/${summaryData.summary.id}/regenerate`
        : "/api/summaries/generate";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: summaryData?.meta?.source === "database" ? summaryData?.document?.id : undefined,
          length
        })
      });

      if (!response.ok) {
        throw new Error(`Summary generation failed with ${response.status}`);
      }

      const data = await response.json();
      setSummaryData(data);
      setStatus("success");
    } catch (requestError) {
      setError(requestError.message || "Unable to generate summary.");
      setStatus("error");
    } finally {
      setIsRegenerating(false);
    }
  }

  async function handleGenerateQuiz(event) {
    event.preventDefault();

    try {
      setQuizGeneration({
        status: "loading",
        message: "Generating AI quiz from this study material..."
      });

      const response = await fetch("/api/quizzes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: document?.id,
          questionCount: 8
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Quiz generation failed.");
      }

      setQuizGeneration({
        status: "success",
        message: `Generated ${data.quiz.questionCount} AI quiz questions.`
      });
      window.location.hash = `#quizzes?documentId=${document.id}&quizId=${data.quiz.id}`;
    } catch (quizError) {
      setQuizGeneration({
        status: "error",
        message: quizError.message || "Unable to generate quiz."
      });
    }
  }

  async function handleGenerateFlashcards(event) {
    event.preventDefault();

    try {
      setFlashcardGeneration({
        status: "loading",
        message: "Generating AI flashcards from this material..."
      });
      const response = await fetch("/api/flashcards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: document?.id,
          cardCount: 12
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Flashcard generation failed.");
      }

      setFlashcardGeneration({
        status: "success",
        message: `Generated ${data.flashcardSet.cards.length} flashcards.`
      });
      window.location.hash = `#flashcards?documentId=${document.id}&setId=${data.flashcardSet.id}`;
    } catch (flashcardError) {
      setFlashcardGeneration({
        status: "error",
        message: flashcardError.message || "Unable to generate flashcards."
      });
    }
  }

  function handleDownloadPdf() {
    try {
      const currentSummaryText = summaryData?.summary?.content?.[length]
        || summaryData?.summary?.displayedContent
        || "";

      if (!currentSummaryText.trim()) {
        throw new Error("Generate a summary before downloading a PDF.");
      }

      setPdfExportState({
        status: "loading",
        message: "Preparing PDF..."
      });

      exportSummaryPdf({
        document,
        summary,
        length,
        summaryText: currentSummaryText,
        questions
      });
      setPdfExportState({
        status: "success",
        message: "PDF downloaded."
      });
    } catch (pdfError) {
      setPdfExportState({
        status: "error",
        message: pdfError.message || "Unable to download summary PDF."
      });
    }
  }

  async function handleSaveSummaryForReview() {
    if (!summaryData?.document?.id || !summaryData?.summary) {
      setSaveSummaryState({ status: "error", message: "Generate a summary before saving it." });
      return;
    }

    try {
      setSaveSummaryState({ status: "loading", message: savedSummary ? "Removing..." : "Saving..." });

      if (savedSummary) {
        const response = await fetch(`/api/review/summaries/${savedSummary.id}`, { method: "DELETE" });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Unable to remove saved summary.");
        }

        setSavedSummary(null);
        setSaveSummaryState({ status: "success", message: "Removed from Review Center." });
        return;
      }

      const currentSummaryText = summaryData.summary.content?.[length] || summaryData.summary.displayedContent || "";
      const response = await fetch("/api/review/summaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: summaryData.document.id,
          summaryId: summaryData.summary.id,
          summaryTitle: summaryData.document.title,
          summaryText: currentSummaryText,
          summaryLength: length
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to save summary.");
      }

      setSavedSummary(data.savedSummary);
      setSaveSummaryState({ status: "success", message: "Saved to Review Center." });
    } catch (saveError) {
      setSaveSummaryState({ status: "error", message: saveError.message || "Unable to update Review Center." });
    }
  }

  async function sendChatMessage(messageOverride = "") {
    const message = String(messageOverride || chatInput).replace(/\s+/g, " ").trim();

    if (!message || chatStatus === "loading") {
      return;
    }

    if (!summaryData?.document?.id) {
      setChatError("Open a document summary before using the study assistant.");
      return;
    }

    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message
    };
    const nextHistory = [...chatMessages, userMessage];

    setChatMessages(nextHistory);
    setChatInput("");
    setChatError("");
    setChatStatus("loading");

    try {
      const response = await fetch(`/api/summaries/${summaryData.document.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          length,
          history: chatMessages.map((item) => ({
            role: item.role,
            content: item.content
          }))
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Study assistant could not answer right now.");
      }

      setChatMessages([
        ...nextHistory,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: data.answer,
          sourceType: data.sourceType || "notes"
        }
      ]);
      setChatStatus("idle");
    } catch (chatRequestError) {
      setChatError(chatRequestError.message || "Study assistant could not answer right now.");
      setChatStatus("error");
      setChatMessages(nextHistory);
    }
  }

  function handleQuestionToChat(question) {
    setIsChatExpanded(true);
    setChatInput(question);
    window.setTimeout(() => {
      sendChatMessage(question);
    }, 180);
  }

  function handleChatTransform(content, action) {
    const prompts = {
      shorter: `Make this answer shorter while keeping the key study points:\n\n${content}`,
      exam: `Turn this into a strong exam answer with clear structure and important terminology:\n\n${content}`,
      flashcards: `Create flashcards from this answer. Use a question and answer format:\n\n${content}`,
      quiz: `Create a short quiz from this answer with questions and answers:\n\n${content}`
    };

    sendChatMessage(prompts[action] || content);
  }

  if (status === "loading") {
    return <SummarySkeleton />;
  }

  if (status === "error") {
    return (
      <section className="state-card">
        <strong>Summary could not load.</strong>
        <p>{error}</p>
      </section>
    );
  }

  const document = summaryData.document;
  const summary = summaryData.summary;
  const questions = summaryData.questions || [];
  const uploadedDate = formatDate(document.uploadedAt);
  const updatedLabel = formatRelativeTimestamp(summary?.updatedAt || document.updatedAt);

  return (
    <div className="summary-page">
      <header className="summary-header">
        <div>
          <span className="summary-breadcrumb">Library &gt; {document.title}</span>
          <h1>{document.title}</h1>
          <div className="summary-meta">
            <span>{formatFileType(document.fileType)} Document</span>
            <span>{document.pageCount || 23} Pages</span>
            <span>Uploaded on {uploadedDate}</span>
          </div>
        </div>

        <div className="summary-header-actions">
          <span className="status-chip">{summary?.status || "No Summary Yet"}</span>
          <span className="updated-chip">{updatedLabel}</span>
          <button className="summary-primary-action" type="button" onClick={handleGenerate} disabled={isRegenerating}>
            <RefreshCw size={17} />
            <span>{isRegenerating ? "Generating" : "Regenerate Summary"}</span>
          </button>
          <button
            className="summary-primary-action secondary"
            type="button"
            onClick={handleSaveSummaryForReview}
            disabled={!summary || saveSummaryState.status === "loading"}
          >
            <Bookmark size={19} />
            <span>{savedSummary ? "Saved" : "Save for Revision"}</span>
          </button>
          <button
            className="summary-icon-button"
            type="button"
            aria-label="Download summary PDF"
            onClick={handleDownloadPdf}
            disabled={pdfExportState.status === "loading" || !summary}
            title="Download PDF"
          >
            <Download size={19} />
          </button>
        </div>
      </header>

      {pdfExportState.status !== "idle" && (
        <div className={`summary-export-status ${pdfExportState.status}`}>
          <span>{pdfExportState.message}</span>
        </div>
      )}

      {saveSummaryState.status !== "idle" && (
        <div className={`summary-export-status ${saveSummaryState.status}`}>
          <span>{saveSummaryState.message}</span>
        </div>
      )}

      {summaryData.meta?.source === "placeholder" && (
        <div className="summary-note">
          <strong>Using sample study content.</strong>
          <span>Connect MongoDB and upload documents with extracted text to persist generated summaries.</span>
        </div>
      )}

      <section className="summary-card">
        <div className="summary-card-heading">
          <div>
            <span className="summary-section-label">AI Summary</span>
            <h2>AI Summary</h2>
          </div>
          <div className="summary-segmented" aria-label="Summary length">
            {["short", "medium", "detailed"].map((option) => (
              <button
                className={length === option ? "active" : ""}
                key={option}
                onClick={() => setLength(option)}
                type="button"
              >
                {capitalize(option)}
              </button>
            ))}
          </div>
        </div>

        {summary ? (
          <>
            <SummarySections text={summary.content?.[length] || summary.displayedContent} length={length} />
            <div className="summary-footnote">
              <span>{capitalize(length)} summary</span>
              <span>{summary.source === "placeholder" ? "Sample fallback" : "Stored summary"}</span>
            </div>
          </>
        ) : (
          <div className="summary-empty">
            <strong>No summary generated yet.</strong>
            <p>Generate a summary from the selected document to create readable study notes.</p>
            <button type="button" onClick={handleGenerate} disabled={isRegenerating}>
              <RefreshCw size={17} />
              <span>Generate Summary</span>
            </button>
          </div>
        )}
      </section>

      <StudyAssistantChat
        error={chatError}
        input={chatInput}
        isExpanded={false}
        messages={chatMessages}
        documentName={document.title}
        onInputChange={setChatInput}
        onExpand={() => setIsChatExpanded(true)}
        onSend={() => sendChatMessage()}
        onTransform={handleChatTransform}
        refNode={chatRef}
        scrollPositions={chatScrollPositions}
        status={chatStatus}
      />

      {isChatExpanded && (
        <StudyAssistantChat
          error={chatError}
          input={chatInput}
          isExpanded
          messages={chatMessages}
          documentName={document.title}
          onClose={() => setIsChatExpanded(false)}
          onInputChange={setChatInput}
          onSend={() => sendChatMessage()}
          onTransform={handleChatTransform}
          scrollPositions={chatScrollPositions}
          status={chatStatus}
        />
      )}

      <section className="questions-card">
        <div className="summary-card-heading">
          <div>
            <span className="summary-section-label">Review Prep</span>
            <h2>Important Questions</h2>
          </div>
        </div>

        {questions.length ? (
          <div className="question-list">
            {questions.slice(0, 5).map((item, index) => (
              <button className="question-row" type="button" onClick={() => handleQuestionToChat(item.question)} key={item.id}>
                <span className="question-number">{index + 1}</span>
                <strong>{item.question}</strong>
                <Send size={17} />
              </button>
            ))}
          </div>
        ) : (
          <EmptyPanel
            title="Questions will appear after summary generation."
            text="Generate a summary to store important revision questions for this document."
          />
        )}

        <a className="view-all-link" href="#quizzes">View all questions</a>
      </section>

      <section className="summary-actions-grid">
        <a className="summary-action-card" href={summaryData.links?.quiz || "#quizzes"} onClick={handleGenerateQuiz}>
          <div className="action-icon blue">
            <Brain size={24} />
          </div>
          <div>
            <h3>{quizGeneration.status === "loading" ? "Generating Quiz" : "Generate Quiz"}</h3>
            <p>{quizGeneration.status === "idle" ? "Create MCQs from this content to test your understanding." : quizGeneration.message}</p>
          </div>
        </a>
        <a className="summary-action-card" href={summaryData.links?.flashcards || "#flashcards"} onClick={handleGenerateFlashcards}>
          <div className="action-icon gold">
            <Layers size={24} />
          </div>
          <div>
            <h3>{flashcardGeneration.status === "loading" ? "Generating Flashcards" : "Generate Flashcards"}</h3>
            <p>{flashcardGeneration.status === "idle" ? "Create flashcards for quick revision of important concepts." : flashcardGeneration.message}</p>
          </div>
        </a>
      </section>
    </div>
  );
}

function SummarySections({ text, length }) {
  const sections = splitSummaryIntoSections(text, length);

  return (
    <div className="summary-sections">
      {sections.map((section) => (
        <article className="summary-section-block" key={section.title}>
          <h3>{section.title}</h3>
          <p>{section.text}</p>
        </article>
      ))}
    </div>
  );
}

function StudyAssistantChat({
  documentName,
  error,
  input,
  isExpanded = false,
  messages,
  onClose,
  onExpand,
  onInputChange,
  onSend,
  onTransform,
  refNode,
  scrollPositions,
  status
}) {
  const historyRef = useRef(null);
  const scrollKey = isExpanded ? "expanded" : "compact";
  const examples = [
    "What is deadlock?",
    "Explain paging.",
    "Give me an exam answer for process scheduling.",
    "Summarize memory management in simple words."
  ];

  useEffect(() => {
    const historyNode = historyRef.current;

    if (!historyNode) {
      return;
    }

    const savedPosition = scrollPositions?.current?.[scrollKey];
    historyNode.scrollTo({
      top: savedPosition || historyNode.scrollHeight,
      behavior: savedPosition ? "auto" : "smooth"
    });
  }, [isExpanded]);

  useEffect(() => {
    const historyNode = historyRef.current;

    if (!historyNode) {
      return;
    }

    historyNode.scrollTo({
      top: historyNode.scrollHeight,
      behavior: "smooth"
    });
  }, [messages, status]);

  function handleHistoryScroll(event) {
    if (scrollPositions?.current) {
      scrollPositions.current[scrollKey] = event.currentTarget.scrollTop;
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSend();
  }

  function handleInputKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  }

  const content = (
    <section className={`study-assistant-card ${isExpanded ? "expanded" : ""}`} ref={refNode}>
      <div className="summary-card-heading study-assistant-heading">
        <div>
          <span className="summary-section-label">Tutor Chat</span>
          <h2>AI Tutor</h2>
          {isExpanded ? (
            <p>
              Current Document:
              <strong>{documentName}</strong>
            </p>
          ) : (
            <p>Ask questions about this document</p>
          )}
        </div>
        {isExpanded ? (
          <button className="study-chat-expand-button" type="button" onClick={onClose}>
            <Minimize2 size={16} />
            <span>Minimize</span>
          </button>
        ) : (
          <button className="study-chat-expand-button" type="button" onClick={onExpand}>
            <Maximize2 size={16} />
            <span>Expand Chat</span>
          </button>
        )}
      </div>

      <div className="study-chat-history" ref={historyRef} onScroll={handleHistoryScroll}>
        {messages.length ? (
          messages.map((message) => (
            <article className={`study-chat-message ${message.role}`} key={message.id}>
              <p>{message.content}</p>
              {message.role === "assistant" && message.sourceType && (
                <span className="study-source-badge">{formatSourceType(message.sourceType)}</span>
              )}
              {message.role === "assistant" && (
                <div className="study-chat-quick-actions" aria-label="AI response actions">
                  <button type="button" onClick={() => onTransform(message.content, "shorter")} disabled={status === "loading"}>
                    Make Shorter
                  </button>
                  <button type="button" onClick={() => onTransform(message.content, "exam")} disabled={status === "loading"}>
                    Exam Answer
                  </button>
                  <button type="button" onClick={() => onTransform(message.content, "flashcards")} disabled={status === "loading"}>
                    Create Flashcards
                  </button>
                  <button type="button" onClick={() => onTransform(message.content, "quiz")} disabled={status === "loading"}>
                    Create Quiz
                  </button>
                </div>
              )}
            </article>
          ))
        ) : (
          <div className="study-chat-empty">
            <strong>Ask anything about these notes.</strong>
            <p>Try a definition, exam answer, simple explanation, or follow-up question.</p>
            <div>
              {examples.map((example) => (
                <button type="button" onClick={() => onInputChange(example)} key={example}>
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}
        {status === "loading" && (
          <article className="study-chat-message assistant thinking">
            <p>Thinking...</p>
          </article>
        )}
      </div>

      {error && <div className="study-chat-error">{error}</div>}

      <form className="study-chat-input-row" onSubmit={handleSubmit}>
        <textarea
          placeholder="Ask anything about these notes..."
          rows={isExpanded ? 3 : 2}
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={handleInputKeyDown}
          disabled={status === "loading"}
        />
        <button type="submit" disabled={status === "loading" || !input.trim()}>
          {status === "loading" ? "Thinking" : "Send"}
        </button>
      </form>
    </section>
  );

  if (isExpanded) {
    return (
      <div className="study-chat-modal-backdrop" role="dialog" aria-modal="true" aria-label="Expanded AI Tutor">
        {content}
      </div>
    );
  }

  return content;
}

function formatSourceType(sourceType) {
  if (sourceType === "general") {
    return "🌐 General Knowledge";
  }

  if (sourceType === "summary") {
    return "📄 From Your Summary";
  }

  return "📄 From Your Notes";
}

function QuizPage() {
  const params = getHashParams();
  const documentId = params.get("documentId");
  const [quizData, setQuizData] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [answers, setAnswers] = useState({});
  const [attemptResult, setAttemptResult] = useState(null);
  const [markedQuestions, setMarkedQuestions] = useState({});
  const [markingQuestionId, setMarkingQuestionId] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadQuiz() {
      try {
        setStatus("loading");
        setError("");
        const query = documentId ? `?documentId=${documentId}` : "";
        const response = await fetch(`/api/quizzes${query}`, {
          signal: controller.signal
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || `Quiz request failed with ${response.status}`);
        }

        setQuizData(data);
        setStatus("success");
      } catch (requestError) {
        if (requestError.name === "AbortError") {
          return;
        }

        setError(requestError.message || "Unable to load quiz.");
        setStatus("error");
      }
    }

    loadQuiz();

    return () => controller.abort();
  }, [documentId]);

  useEffect(() => {
    if (!quizData?.quiz) {
      setMarkedQuestions({});
      return;
    }

    let cancelled = false;

    async function loadMarkedQuestions() {
      try {
        const response = await fetch("/api/review/questions");
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Unable to load marked questions.");
        }

        const byQuestionId = {};
        (data.questions || []).forEach((item) => {
          if (item.quizId === quizData.quiz.id) {
            byQuestionId[item.questionId] = item;
          }
        });

        if (!cancelled) {
          setMarkedQuestions(byQuestionId);
        }
      } catch {
        if (!cancelled) {
          setMarkedQuestions({});
        }
      }
    }

    loadMarkedQuestions();

    return () => {
      cancelled = true;
    };
  }, [quizData?.quiz?.id]);

  async function handleGenerateQuiz() {
    try {
      setIsGenerating(true);
      setError("");
      const response = await fetch("/api/quizzes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: quizData?.document?.id || documentId,
          questionCount: 8
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Quiz generation failed.");
      }

      setQuizData(data);
      setAnswers({});
      setAttemptResult(null);
      setMarkedQuestions({});
      setStatus("success");
      window.location.hash = `#quizzes?documentId=${data.document.id}&quizId=${data.quiz.id}`;
    } catch (generateError) {
      setError(generateError.message || "Unable to generate quiz.");
      setStatus("error");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSubmitAttempt() {
    if (!quizData?.quiz) {
      return;
    }

    try {
      const orderedAnswers = quizData.quiz.questions.map((_, index) => answers[index]);
      const response = await fetch(`/api/quizzes/${quizData.quiz.id}/attempt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: orderedAnswers,
          timeSpentMinutes: 0
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not submit quiz attempt.");
      }

      setAttemptResult(data.attempt);
      window.dispatchEvent(new Event("studymind:dashboard-refresh"));
    } catch (submitError) {
      setError(submitError.message || "Could not submit quiz attempt.");
    }
  }

  async function toggleMarkedQuestion(question, questionIndex) {
    if (!quizData?.quiz || !question?.id) {
      return;
    }

    try {
      setMarkingQuestionId(question.id);
      const existing = markedQuestions[question.id];

      if (existing) {
        const response = await fetch(`/api/review/questions/${existing.id}`, { method: "DELETE" });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Unable to unmark question.");
        }

        setMarkedQuestions((current) => {
          const next = { ...current };
          delete next[question.id];
          return next;
        });
        return;
      }

      const response = await fetch("/api/review/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quizId: quizData.quiz.id,
          questionId: question.id,
          userAnswer: answers[questionIndex]
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to mark question.");
      }

      setMarkedQuestions((current) => ({
        ...current,
        [question.id]: data.markedQuestion
      }));
    } catch (markError) {
      setError(markError.message || "Unable to update marked question.");
    } finally {
      setMarkingQuestionId("");
    }
  }

  const quiz = quizData?.quiz;
  const allAnswered = Boolean(quiz) && quiz.questions.every((_, index) => Number.isInteger(answers[index]));

  if (status === "loading") {
    return <QuizSkeleton />;
  }

  return (
    <div className="quiz-page">
      <header className="quiz-header">
        <div>
          <span className="summary-breadcrumb">Quizzes {quizData?.document?.title ? `> ${quizData.document.title}` : ""}</span>
          <h1>AI Quiz Generator</h1>
          <p>Practice with multiple-choice questions generated from your uploaded study material.</p>
        </div>
        <button className="summary-primary-action" type="button" onClick={handleGenerateQuiz} disabled={isGenerating}>
          <RefreshCw size={17} />
          <span>{isGenerating ? "Generating" : quiz ? "Generate New Quiz" : "Generate Quiz"}</span>
        </button>
      </header>

      {error && (
        <div className="quiz-alert">
          <strong>Quiz unavailable.</strong>
          <span>{error}</span>
        </div>
      )}

      {status === "success" && !quiz && (
        <section className="quiz-empty-card">
          <Brain size={34} />
          <strong>No quiz generated yet.</strong>
          <p>Generate an AI quiz from the latest uploaded document or open a document from Summary first.</p>
          <button type="button" onClick={handleGenerateQuiz} disabled={isGenerating}>
            {isGenerating ? "Generating Quiz" : "Generate Quiz"}
          </button>
        </section>
      )}

      {quiz && (
        <>
          <section className="quiz-meta-card">
            <div>
              <span>Source</span>
              <strong>{capitalize(quiz.source || "summary")}</strong>
            </div>
            <div>
              <span>Questions</span>
              <strong>{quiz.questionCount}</strong>
            </div>
            <div>
              <span>Document</span>
              <strong>{quizData.document.title}</strong>
            </div>
          </section>

          <section className="quiz-question-list">
            {quiz.questions.map((question, questionIndex) => (
              <article className="quiz-question-card" key={question.id || question.question}>
                <div className="quiz-question-top">
                  <span>Question {questionIndex + 1}</span>
                  <div className="quiz-question-actions">
                    <button
                      type="button"
                      onClick={() => toggleMarkedQuestion(question, questionIndex)}
                      disabled={markingQuestionId === question.id}
                    >
                      {markedQuestions[question.id] ? "Marked" : "Mark for Review"}
                    </button>
                    <em>{capitalize(question.difficulty)}</em>
                  </div>
                </div>
                <h2>{question.question}</h2>
                <div className="quiz-options">
                  {question.options.map((option, optionIndex) => {
                    const isSelected = answers[questionIndex] === optionIndex;
                    const showResult = Boolean(attemptResult);
                    const isCorrect = question.correctAnswer === optionIndex;
                    const isWrongSelected = showResult && isSelected && !isCorrect;

                    return (
                      <button
                        className={`quiz-option ${isSelected ? "selected" : ""} ${showResult && isCorrect ? "correct" : ""} ${isWrongSelected ? "wrong-selected" : ""}`}
                        key={option}
                        type="button"
                        onClick={() => setAnswers((current) => ({ ...current, [questionIndex]: optionIndex }))}
                        disabled={showResult}
                      >
                        <span>{String.fromCharCode(65 + optionIndex)}</span>
                        {option}
                      </button>
                    );
                  })}
                </div>
                {attemptResult && (
                  <p className="quiz-explanation">{question.explanation}</p>
                )}
              </article>
            ))}
          </section>

          <div className="quiz-submit-row">
            {attemptResult && (
              <strong>
                Score: {attemptResult.score}/{attemptResult.totalQuestions} ({attemptResult.percentage}%)
              </strong>
            )}
            <button type="button" onClick={handleSubmitAttempt} disabled={!allAnswered || Boolean(attemptResult)}>
              Submit Quiz
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function FlashcardsPage() {
  const params = getHashParams();
  const documentId = params.get("documentId");
  const [deckData, setDeckData] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [savingState, setSavingState] = useState("idle");

  useEffect(() => {
    const controller = new AbortController();

    async function loadFlashcards() {
      try {
        setStatus("loading");
        setError("");
        const query = documentId ? `?documentId=${documentId}` : "";
        const response = await fetch(`/api/flashcards${query}`, {
          signal: controller.signal
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || `Flashcards request failed with ${response.status}`);
        }

        setDeckData(data);
        setCurrentIndex(data.progress?.currentCardIndex || 0);
        setIsFlipped(false);
        setStatus("success");
      } catch (requestError) {
        if (requestError.name === "AbortError") {
          return;
        }

        setError(requestError.message || "Unable to load flashcards.");
        setStatus("error");
      }
    }

    loadFlashcards();

    return () => controller.abort();
  }, [documentId]);

  async function handleGenerateFlashcards() {
    try {
      setIsGenerating(true);
      setError("");
      const response = await fetch("/api/flashcards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: deckData?.document?.id || documentId,
          cardCount: 12
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Flashcard generation failed.");
      }

      setDeckData(data);
      setCurrentIndex(0);
      setIsFlipped(false);
      setStatus("success");
      window.location.hash = `#flashcards?documentId=${data.document.id}&setId=${data.flashcardSet.id}`;
    } catch (generateError) {
      setError(generateError.message || "Unable to generate flashcards.");
      setStatus("error");
    } finally {
      setIsGenerating(false);
    }
  }

  async function saveProgress(nextIndex, rating = "") {
    if (!deckData?.flashcardSet) {
      return;
    }

    try {
      setSavingState("saving");
      const response = await fetch(`/api/flashcards/${deckData.flashcardSet.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentCardIndex: nextIndex,
          cardOrder: currentCard?.order,
          rating
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not save flashcard progress.");
      }

      setDeckData((current) => ({
        ...current,
        progress: data.progress
      }));
      setSavingState("saved");
    } catch (saveError) {
      setSavingState("error");
      setError(saveError.message || "Could not save flashcard progress.");
    }
  }

  function goToCard(nextIndex) {
    const count = deckData?.flashcardSet?.cards?.length || 0;
    const safeIndex = Math.min(count - 1, Math.max(0, nextIndex));
    setCurrentIndex(safeIndex);
    setIsFlipped(false);
    saveProgress(safeIndex);
  }

  function handleReview(rating) {
    const count = deckData?.flashcardSet?.cards?.length || 0;
    const nextIndex = Math.min(count - 1, currentIndex + 1);
    saveProgress(nextIndex, rating);

    if (currentIndex < count - 1) {
      setCurrentIndex(nextIndex);
      setIsFlipped(false);
    }
  }

  const deck = deckData?.flashcardSet;
  const cards = deck?.cards || [];
  const currentCard = cards[currentIndex];
  const progressPercent = cards.length ? Math.round(((currentIndex + 1) / cards.length) * 100) : 0;

  if (status === "loading") {
    return <FlashcardsSkeleton />;
  }

  return (
    <div className="flashcards-page">
      <header className="flashcards-header">
        <div>
          <span className="summary-breadcrumb">Flashcards {deckData?.document?.title ? `> ${deckData.document.title}` : ""}</span>
          <h1>AI Flashcards</h1>
          <p>Flip through concise revision cards generated from your uploaded study material.</p>
        </div>
        <button className="summary-primary-action" type="button" onClick={handleGenerateFlashcards} disabled={isGenerating}>
          <RefreshCw size={17} />
          <span>{isGenerating ? "Generating" : deck ? "Generate New Deck" : "Generate Flashcards"}</span>
        </button>
      </header>

      {error && (
        <div className="quiz-alert">
          <strong>Flashcards unavailable.</strong>
          <span>{error}</span>
        </div>
      )}

      {status === "success" && !deck && (
        <section className="flashcards-empty-card">
          <BookOpen size={36} />
          <strong>No flashcards generated yet.</strong>
          <p>Generate AI flashcards from your latest uploaded document or open a document from Summary first.</p>
          <button type="button" onClick={handleGenerateFlashcards} disabled={isGenerating}>
            {isGenerating ? "Generating Flashcards" : "Generate Flashcards"}
          </button>
        </section>
      )}

      {deck && currentCard && (
        <>
          <section className="flashcards-info">
            <div>
              <span>Deck</span>
              <strong>{deck.title}</strong>
            </div>
            <div>
              <span>Cards</span>
              <strong>{cards.length}</strong>
            </div>
            <div>
              <span>Progress</span>
              <strong>{currentIndex + 1}/{cards.length}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{savingState === "saving" ? "Saving" : savingState === "error" ? "Save failed" : "Saved"}</strong>
            </div>
          </section>

          <section className="flashcard-study-area">
            <button className="flash-nav-button" type="button" onClick={() => goToCard(currentIndex - 1)} disabled={currentIndex === 0}>
              Previous
            </button>

            <button className={`flashcard-stage ${isFlipped ? "flipped" : ""}`} type="button" onClick={() => setIsFlipped((value) => !value)}>
              <div className="flashcard-face flashcard-front">
                <h2>{currentCard.front}</h2>
                <em>{currentCard.topic || deck.topic}</em>
                <span>Tap for answer</span>
              </div>
              <div className="flashcard-face flashcard-back">
                <h2>{currentCard.back}</h2>
                <em>{capitalize(currentCard.difficulty || "medium")}</em>
                <span>Tap to return</span>
              </div>
            </button>

            <button className="flash-nav-button" type="button" onClick={() => goToCard(currentIndex + 1)} disabled={currentIndex === cards.length - 1}>
              Next
            </button>
          </section>

          <section className="flashcard-controls">
            <div className="flash-progress">
              <span style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="flash-review-buttons">
              <button className="again" type="button" onClick={() => handleReview("again")}>Didn&apos;t Know</button>
              <button className="almost" type="button" onClick={() => handleReview("almost")}>Almost</button>
              <button className="got-it" type="button" onClick={() => handleReview("got-it")}>Got It</button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function DashboardContent({ dashboard, liveStudySeconds = 0 }) {
  const hasData = dashboard.meta?.hasData;

  return (
    <>
      {!hasData && <EmptyDataBanner />}
      <section className="stats-grid" aria-label="Dashboard statistics">
        {statConfig.map((stat) => (
          <StatCard
            icon={stat.icon}
            key={stat.key}
            label={stat.label}
            trend={dashboard.stats.trends?.[stat.key]}
            value={dashboard.stats[stat.key]}
            suffix={stat.suffix}
          />
        ))}
      </section>

      <DailyGoalWidget goal={dashboard.goal} liveStudySeconds={liveStudySeconds} />

      <section className="progress-layout">
        <ProgressCard progress={dashboard.progress} />
        <InsightsCard insights={dashboard.insights} />
      </section>

      <ContinueLearning items={dashboard.continueLearning} />
    </>
  );
}

function StatCard({ icon: Icon, label, value, suffix = "", trend }) {
  const displayValue = typeof value === "number" ? `${value}${suffix}` : value;

  return (
    <article className="stat-card">
      <div className="stat-icon">
        <Icon size={22} />
      </div>
      <div>
        <strong>{displayValue}</strong>
        <span>{label}</span>
        {trend && (
          <small className={`stat-trend ${trend.direction === "down" ? "negative" : "positive"}`}>
            {trend.direction === "down" ? "↓" : "↑"} {trend.label}
          </small>
        )}
      </div>
    </article>
  );
}

function DailyGoalWidget({ goal, liveStudySeconds }) {
  const [goalState, setGoalState] = useState(() => normalizeGoal(goal));
  const [saveStatus, setSaveStatus] = useState("idle");
  const [saveError, setSaveError] = useState("");
  const studyOptions = [
    { label: "30 min", value: 30 },
    ...Array.from({ length: 24 }, (_, index) => ({
      label: index === 0 ? "1 hour" : `${index + 1} hours`,
      value: (index + 1) * 60
    }))
  ];
  const quizOptions = Array.from({ length: 50 }, (_, index) => index + 1);
  const liveMinutes = liveStudySeconds / 60;
  const studyProgress = (goalState.todayStudyMinutes || 0) + liveMinutes;
  const quizProgress = goalState.todayQuizAttempts || 0;
  const isStudyGoal = goalState.type === "studyTime";
  const actualValue = isStudyGoal ? studyProgress : quizProgress;
  const targetValue = isStudyGoal ? goalState.targetMinutes : goalState.targetQuizzes;
  const progressPercent = Math.min(100, Math.round((actualValue / Math.max(targetValue, 1)) * 100));
  const goalComplete = actualValue >= targetValue;
  const progressLabel = isStudyGoal
    ? `${formatHours(actualValue / 60)} / ${formatGoalHours(goalState.targetMinutes)}`
    : `${Math.floor(actualValue)} / ${targetValue} quizzes`;

  useEffect(() => {
    setGoalState(normalizeGoal(goal));
  }, [goal]);

  async function saveGoal(nextGoal) {
    setGoalState((current) => ({ ...current, ...nextGoal }));
    setSaveStatus("saving");
    setSaveError("");

    try {
      const response = await fetch("/api/dashboard/goal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...goalState, ...nextGoal })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not save daily goal.");
      }

      setGoalState((current) => ({ ...current, ...normalizeGoal({ ...current, ...data.goal }) }));
      setSaveStatus("saved");
      window.dispatchEvent(new Event("studymind:dashboard-refresh"));
    } catch (goalError) {
      setSaveError(goalError.message || "Could not save daily goal.");
      setSaveStatus("error");
    }
  }

  return (
    <section className={`daily-goal-card ${goalComplete ? "complete" : ""}`}>
      <div className="daily-goal-main">
        <span>Daily Goal</span>
        <strong>{isStudyGoal ? "Study Time Goal" : "Quiz Goal"}</strong>
        <p>{progressLabel}</p>
        {goalComplete && <small>Goal Completed 🎉</small>}
        {saveStatus === "saving" && <small>Saving goal...</small>}
        {saveError && <small className="daily-goal-error">{saveError}</small>}
      </div>
      <div className="daily-goal-options" role="group" aria-label="Goal type">
        <button
          className={isStudyGoal ? "active" : ""}
          onClick={() => saveGoal({ type: "studyTime" })}
          type="button"
        >
          Study Time
        </button>
        <button
          className={!isStudyGoal ? "active" : ""}
          onClick={() => saveGoal({ type: "quiz" })}
          type="button"
        >
          Quiz Goal
        </button>
      </div>
      <div className="daily-goal-custom">
        {isStudyGoal ? (
          <select
            aria-label="Study time goal"
            onChange={(event) => saveGoal({ targetMinutes: Number(event.target.value) })}
            value={goalState.targetMinutes}
          >
            {studyOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        ) : (
          <select
            aria-label="Quiz goal"
            onChange={(event) => saveGoal({ targetQuizzes: Number(event.target.value) })}
            value={goalState.targetQuizzes}
          >
            {quizOptions.map((value) => (
              <option key={value} value={value}>{value} {value === 1 ? "quiz" : "quizzes"}</option>
            ))}
          </select>
        )}
      </div>
      <div className="daily-goal-progress">
        <span style={{ width: `${progressPercent}%` }} />
      </div>
    </section>
  );
}

function normalizeGoal(goal) {
  return {
    type: goal?.type === "quiz" ? "quiz" : "studyTime",
    targetMinutes: clamp(goal?.targetMinutes, 30, 24 * 60, 60),
    targetQuizzes: clamp(goal?.targetQuizzes, 1, 50, 3),
    todayStudyMinutes: Number(goal?.todayStudyMinutes || 0),
    todayQuizAttempts: Number(goal?.todayQuizAttempts || 0)
  };
}

function clamp(value, min, max, fallback) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(number)));
}

function formatGoalHours(minutes) {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  return `${formatHours(minutes / 60)} hrs`;
}

function ProgressCard({ progress }) {
  const [activeMetric, setActiveMetric] = useState("studyTime");
  const [period, setPeriod] = useState("week");
  const chartData = progress.chartData || [];
  const visibleData = useMemo(() => filterProgressByPeriod(chartData, period), [chartData, period]);
  const hasStudyTime = visibleData.some((item) => (item.studyTime || 0) > 0);
  const hasQuizScores = visibleData.some((item) => item.quizScore !== null && item.quizScore !== undefined);
  const hasActiveMetricData = activeMetric === "studyTime" ? hasStudyTime : hasQuizScores;
  const metrics = calculateProgressMetrics(visibleData, activeMetric);

  return (
    <section className="panel progress-panel">
      <div className="section-heading">
        <h2>Study Progress</h2>
        <label className="progress-range-select">
          <select value={period} onChange={(event) => setPeriod(event.target.value)}>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
          <ChevronDown size={16} />
        </label>
      </div>

      <div className="metric-switcher" role="tablist" aria-label="Study progress metric">
        <button
          className={activeMetric === "studyTime" ? "active" : ""}
          onClick={() => setActiveMetric("studyTime")}
          type="button"
        >
          Study Time
        </button>
        <button
          className={activeMetric === "quizScores" ? "active" : ""}
          onClick={() => setActiveMetric("quizScores")}
          type="button"
        >
          Quiz Scores
        </button>
      </div>

      <div className="progress-content">
        {hasActiveMetricData ? (
          <ProgressChart data={visibleData} metric={activeMetric} />
        ) : (
          <StudyProgressEmptyState />
        )}
      </div>

      <div className="progress-metrics-grid">
        {activeMetric === "studyTime" ? (
          <>
            <ProgressMetricCard label="Total Study Time" value={`${formatHours(metrics.totalStudyHours)} hrs`} />
            <ProgressMetricCard label="Daily Average" value={`${formatHours(metrics.averageStudyHours)} hrs/day`} />
          </>
        ) : (
          <>
            <ProgressMetricCard label="Average Score" value={`${metrics.averageScore}%`} />
            <ProgressMetricCard label="Best Score" value={`${metrics.bestScore}%`} />
          </>
        )}
      </div>
    </section>
  );
}

function filterProgressByPeriod(chartData, period) {
  if (!chartData.length) {
    return [];
  }

  const now = new Date();
  const start = period === "month" ? new Date(now.getFullYear(), now.getMonth(), 1) : startOfCurrentWeek(now);
  start.setHours(0, 0, 0, 0);

  return chartData.filter((item) => {
    const date = new Date(`${item.date}T00:00:00`);
    return date >= start && date <= now;
  });
}

function startOfCurrentWeek(date) {
  const start = new Date(date);
  const day = start.getDay();
  const daysSinceMonday = (day + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);
  return start;
}

function StudyProgressEmptyState() {
  return (
    <div className="progress-empty-state">
      <div className="progress-empty-icon">
        <BookOpen size={22} />
      </div>
      <strong>Start studying to see your progress.</strong>
      <p>Complete quizzes and review flashcards to build your learning history.</p>
    </div>
  );
}

function ProgressMetricCard({ label, value }) {
  return (
    <article className="progress-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function ProgressChart({ data, metric }) {
  const chart = useMemo(() => buildSingleMetricChart(data, metric), [data, metric]);
  const strokeClass = metric === "studyTime" ? "study-line" : "score-line";
  const ariaLabel = metric === "studyTime" ? "Study time over time" : "Quiz scores over time";

  return (
    <div className="chart-wrap">
      <svg className="progress-chart" viewBox="0 0 900 340" role="img" aria-label={ariaLabel}>
        <g className="grid-lines">
          {[0, 1, 2, 3, 4].map((line) => (
            <line key={line} x1="58" x2="858" y1={54 + line * 58} y2={54 + line * 58} />
          ))}
        </g>
        <g className="axis-labels">
          {chart.yLabels.map((label) => (
            <text key={label.y} x={label.x} y={label.y}>{label.text}</text>
          ))}
          {chart.xLabels.map((label) => (
            <text key={label.x} x={label.x} y="326">{label.text}</text>
          ))}
        </g>
        <path className={strokeClass} d={chart.path} />
        {chart.points.map((point) => (
          <circle className={`chart-dot ${strokeClass}`} cx={point.x} cy={point.y} key={`${point.x}-${point.y}`} r="4">
            <title>{point.tooltip}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

function buildSingleMetricChart(data, metric) {
  const width = 800;
  const height = 232;
  const startX = 58;
  const startY = 54;
  const step = width / Math.max(data.length - 1, 1);
  const values = data.map((item) => {
    const rawValue = metric === "studyTime" ? (item.studyTime || 0) / 60 : item.quizScore;
    return rawValue === null || rawValue === undefined ? null : rawValue;
  }).filter((value) => value !== null);
  const maxValue = metric === "studyTime"
    ? Math.max(1, Math.ceil(Math.max(...values)))
    : 100;
  const activeItems = data.filter((item) => (
    metric === "studyTime"
      ? (item.studyTime || 0) > 0
      : item.quizScore !== null && item.quizScore !== undefined
  ));
  const mapY = (value) => startY + height - (Math.min(value, maxValue) / maxValue) * height;
  const points = activeItems.map((item, index) => {
    const originalIndex = data.indexOf(item);
    const value = metric === "studyTime" ? (item.studyTime || 0) / 60 : item.quizScore;

    return {
      x: startX + originalIndex * step,
      y: mapY(value),
      value,
      tooltip: metric === "studyTime"
        ? `${item.label}: ${formatHours(value)} hours`
        : `${item.label}: ${Math.round(value)}%`
    };
  });
  const path = buildStraightPath(points);
  const yLabels = metric === "studyTime"
    ? [
        { x: 22, y: 58, text: `${maxValue}h` },
        { x: 25, y: 174, text: `${formatHours(maxValue / 2)}h` },
        { x: 38, y: 290, text: "0h" }
      ]
    : [
        { x: 24, y: 58, text: "100%" },
        { x: 31, y: 174, text: "50%" },
        { x: 38, y: 290, text: "0%" }
      ];
  const xLabels = data
    .filter((_, index) => index === 0 || index === data.length - 1 || (data.length > 10 && index % 7 === 0))
    .map((item, labelIndex, visibleItems) => ({
      text: item.label,
      x: startX + data.indexOf(item) * step - (labelIndex === visibleItems.length - 1 ? 28 : 10)
    }));

  return { path, points, yLabels, xLabels };
}

function buildStraightPath(points) {
  if (!points.length) {
    return "";
  }

  return points.reduce((path, point, index) => {
    if (index === 0) {
      return `M ${point.x} ${point.y}`;
    }

    return `${path} L ${point.x} ${point.y}`;
  }, "");
}

function calculateProgressMetrics(data) {
  const studyHours = data.map((item) => (item.studyTime || 0) / 60);
  const scores = data
    .map((item) => item.quizScore)
    .filter((score) => Number.isFinite(score));
  const totalStudyHours = studyHours.reduce((sum, value) => sum + value, 0);
  const averageStudyHours = data.length ? totalStudyHours / data.length : 0;
  const averageScore = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : 0;
  const bestScore = scores.length ? Math.round(Math.max(...scores)) : 0;

  return { totalStudyHours, averageStudyHours, averageScore, bestScore };
}

function formatHours(value) {
  return Number(value || 0).toFixed(1).replace(/\.0$/, "");
}

function InsightsCard({ insights }) {
  return (
    <section className="panel insights-panel">
      <div className="section-heading">
        <h2>Study Insights</h2>
      </div>

      <div className="insights-list">
        {insights.length ? (
          insights.slice(0, 3).map((insight) => {
            const Icon = insightIcons[insight.type] || Sparkles;

            return (
              <a className="insight-card" href={insight.href || "#summary"} key={insight.title}>
                <div className="mini-icon">
                  <Icon size={18} />
                </div>
                <div>
                  <strong>{insight.title}</strong>
                  <p>{insight.detail}</p>
                </div>
              </a>
            );
          })
        ) : (
          <EmptyPanel
            title="Insights will unlock after a few attempts."
            text="Quiz history helps identify topics that need attention."
          />
        )}
      </div>
    </section>
  );
}

function ContinueLearning({ items }) {
  return (
    <section className="continue-section">
      <div className="section-heading">
        <h2>Continue Learning</h2>
      </div>

      {items.length ? (
        <div className="learning-grid">
          {items.map((item) => (
            <article className="learning-card" key={item.subject}>
              <div className="subject-icon">
                <BookOpen size={22} />
              </div>
              <div className="learning-content">
                <h3>{item.subject}</h3>
                <p>{item.lastStudied}</p>
                <span className="learning-status">{item.status}</span>
                <div className="progress-meta">
                  <span>{item.lastScore === null || item.lastScore === undefined ? item.detail : `Last Quiz Score: ${item.lastScore}%`}</span>
                  <strong>{item.progress}%</strong>
                </div>
                <div className="progress-bar">
                  <span style={{ width: `${item.progress}%` }} />
                </div>
              </div>
              <div className="learning-actions">
                <a className="primary" href={item.summaryHref || "#summary"}>{item.primaryActionLabel || "Continue"}</a>
                <a className="secondary" href={item.quizHref || "#quizzes"}>Quiz Yourself</a>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="panel continue-empty">
          <EmptyPanel
            title="No subjects in progress yet."
            text="Upload a document or complete a quiz to populate this row with real learning paths."
          />
        </div>
      )}
    </section>
  );
}

function EmptyDataBanner() {
  return (
    <div className="empty-banner">
      <strong>No study activity yet.</strong>
      <span>Dashboard metrics will update from your documents, quiz attempts, and flashcards.</span>
    </div>
  );
}

function EmptyPanel({ title, text }) {
  return (
    <div className="empty-panel">
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function ErrorState({ message }) {
  return (
    <section className="state-card">
      <strong>Dashboard could not load.</strong>
      <p>{message}</p>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <section className="stats-grid">
        {statConfig.map((stat) => (
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

function SummarySkeleton() {
  return (
    <div className="summary-page">
      <div className="summary-header skeleton-panel" />
      <div className="summary-card skeleton-panel" />
      <div className="questions-card skeleton-panel" />
      <section className="summary-actions-grid">
        <div className="summary-action-card skeleton-panel" />
        <div className="summary-action-card skeleton-panel" />
      </section>
    </div>
  );
}

function QuizSkeleton() {
  return (
    <div className="quiz-page">
      <div className="quiz-header skeleton-panel" />
      <div className="quiz-meta-card skeleton-panel" />
      <div className="quiz-question-card skeleton-panel" />
      <div className="quiz-question-card skeleton-panel" />
    </div>
  );
}

function FlashcardsSkeleton() {
  return (
    <div className="flashcards-page">
      <div className="flashcards-header skeleton-panel" />
      <div className="flashcards-info skeleton-panel" />
      <div className="flashcard-study-area skeleton-panel" />
    </div>
  );
}

function formatDate(date) {
  if (!date) {
    return "2 Jun 2024";
  }

  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function formatRelativeTimestamp(date) {
  if (!date) {
    return "Updated recently";
  }

  const diff = Date.now() - new Date(date).getTime();
  const hours = Math.max(0, Math.floor(diff / (60 * 60 * 1000)));

  if (hours < 1) {
    return "Updated just now";
  }

  if (hours < 24) {
    return `Updated ${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `Updated ${days}d ago`;
}

function formatFileType(fileType) {
  return (fileType || "PDF").toUpperCase();
}

function formatFileSize(bytes) {
  const value = Number(bytes || 0);

  if (!value) {
    return "—";
  }

  if (value < 1024 * 1024) {
    return `${Math.max(1, Math.round(value / 1024))} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}

function buildReviewFolderCards(summaryGroups, questionGroups) {
  const folders = new Map();

  summaryGroups.forEach((group) => {
    const key = group.folderId || "uncategorized";
    const existing = folders.get(key) || {
      key,
      folderId: group.folderId || null,
      folderName: group.folderName || "Uncategorized",
      savedSummaryCount: 0,
      markedQuestionCount: 0
    };

    existing.savedSummaryCount = group.savedSummaries?.length || 0;
    folders.set(key, existing);
  });

  questionGroups.forEach((group) => {
    const key = group.folderId || "uncategorized";
    const existing = folders.get(key) || {
      key,
      folderId: group.folderId || null,
      folderName: group.folderName || "Uncategorized",
      savedSummaryCount: 0,
      markedQuestionCount: 0
    };

    existing.markedQuestionCount = group.markedQuestions?.length || 0;
    folders.set(key, existing);
  });

  return [...folders.values()].sort((a, b) => a.folderName.localeCompare(b.folderName));
}

function findReviewGroup(groups, folderKey, itemKey) {
  const group = groups.find((item) => (item.folderId || "uncategorized") === folderKey);
  return group?.[itemKey] || [];
}

function formatQuizAnswer(options = [], index) {
  if (!Number.isInteger(index) || index < 0 || index >= options.length) {
    return "Not answered";
  }

  return `${String.fromCharCode(65 + index)}. ${options[index]}`;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function splitSummaryIntoSections(text, length) {
  const sentences = String(text || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map(cleanDisplaySentence)
    .filter(Boolean);
  const groups = [];
  let current = "";
  const maxWords = length === "detailed" ? 80 : length === "medium" ? 58 : 48;

  sentences.forEach((sentence) => {
    const candidate = [current, sentence].filter(Boolean).join(" ");

    if (candidate.split(/\s+/).length > maxWords && current) {
      groups.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  });

  if (current) {
    groups.push(current);
  }

  const titles = getSummarySectionTitles(length);

  return (groups.length ? groups : [text]).map((group, index) => ({
    title: titles[index] || `Study Note ${index + 1}`,
    text: group
  }));
}

function getSummarySectionTitles(length) {
  if (length === "short") {
    return ["Overview", "Why It Matters", "Revision Focus"];
  }

  if (length === "medium") {
    return ["Overview", "Key Concepts", "How It Works", "Exam Focus"];
  }

  return ["Overview", "Core Ideas", "Important Details", "Applications", "Revision Strategy", "Exam Focus"];
}

function cleanDisplaySentence(sentence) {
  return sentence
    .replace(/[•●○▪▫]/g, "")
    .replace(/^\s*[-–—:;,.]+/, "")
    .replace(/^\s*\d+[\).:-]\s*/, "")
    .replace(/\s+\d+[\).]\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function exportSummaryPdf({ document: documentData, summary, length, summaryText, questions }) {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 54;
  const contentWidth = pageWidth - margin * 2;
  const title = documentData?.title || "Study Summary";
  const generatedDate = summary?.updatedAt || summary?.generatedAt || new Date().toISOString();
  let cursorY = margin;

  function addFooter() {
    const pageCount = pdf.internal.getNumberOfPages();

    for (let pageIndex = 1; pageIndex <= pageCount; pageIndex += 1) {
      pdf.setPage(pageIndex);
      pdf.setDrawColor(219, 226, 244);
      pdf.line(margin, pageHeight - 42, pageWidth - margin, pageHeight - 42);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(114, 128, 160);
      pdf.text("StudyMind AI", margin, pageHeight - 24);
      pdf.text(`Page ${pageIndex} of ${pageCount}`, pageWidth - margin, pageHeight - 24, { align: "right" });
    }
  }

  function ensureSpace(heightNeeded) {
    if (cursorY + heightNeeded <= pageHeight - 64) {
      return;
    }

    pdf.addPage();
    cursorY = margin;
  }

  function writeWrappedText(text, options = {}) {
    const {
      fontSize = 11,
      lineHeight = 17,
      color = [35, 45, 70],
      style = "normal",
      indent = 0
    } = options;
    const lines = pdf.splitTextToSize(String(text || ""), contentWidth - indent);

    pdf.setFont("helvetica", style);
    pdf.setFontSize(fontSize);
    pdf.setTextColor(...color);

    lines.forEach((line) => {
      ensureSpace(lineHeight + 2);
      pdf.text(line, margin + indent, cursorY);
      cursorY += lineHeight;
    });

    return lines.length;
  }

  function writeSectionTitle(text) {
    ensureSpace(34);
    cursorY += 8;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.setTextColor(10, 45, 122);
    pdf.text(text, margin, cursorY);
    cursorY += 18;
    pdf.setDrawColor(245, 179, 1);
    pdf.line(margin, cursorY, margin + 96, cursorY);
    cursorY += 22;
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(24);
  pdf.setTextColor(10, 45, 122);
  writeWrappedText(title, {
    fontSize: 24,
    lineHeight: 30,
    color: [10, 45, 122],
    style: "bold"
  });

  cursorY += 6;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(92, 106, 134);
  const metadata = [
    `${capitalize(length)} summary`,
    `${formatFileType(documentData?.fileType)} document`,
    documentData?.pageCount ? `${documentData.pageCount} pages` : null,
    documentData?.subject || documentData?.folderName || null,
    `Generated ${formatDate(generatedDate)}`
  ].filter(Boolean).join("  |  ");
  writeWrappedText(metadata, {
    fontSize: 10,
    lineHeight: 15,
    color: [92, 106, 134]
  });

  writeSectionTitle("AI Summary");
  splitSummaryIntoSections(summaryText, length).forEach((section) => {
    ensureSpace(42);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(245, 179, 1);
    pdf.text(section.title, margin, cursorY);
    cursorY += 17;
    writeWrappedText(section.text, {
      fontSize: 11,
      lineHeight: 17,
      color: [35, 45, 70]
    });
    cursorY += 8;
  });

  writeSectionTitle("Important Questions");

  if (questions?.length) {
    questions.forEach((item, index) => {
      const questionText = cleanDisplaySentence(item.question || item);
      ensureSpace(28);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10.5);
      pdf.setTextColor(10, 45, 122);
      pdf.text(`${index + 1}.`, margin, cursorY);
      writeWrappedText(questionText, {
        fontSize: 11,
        lineHeight: 17,
        color: [35, 45, 70],
        indent: 24
      });
      cursorY += 5;
    });
  } else {
    writeWrappedText("No important questions are available for this summary yet.", {
      fontSize: 11,
      lineHeight: 17,
      color: [92, 106, 134]
    });
  }

  addFooter();
  pdf.save(buildSummaryPdfFilename(title));
}

function buildSummaryPdfFilename(title) {
  const safeTitle = String(title || "Summary")
    .replace(/[^a-z0-9]+/gi, "")
    .slice(0, 80);

  return `StudyMindAI_Summary_${safeTitle || "Summary"}.pdf`;
}

createRoot(document.getElementById("root")).render(<App />);
