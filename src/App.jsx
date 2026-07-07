import React, { useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  BookOpen,
  Bookmark,
  Brain,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Flame,
  Folder,
  GraduationCap,
  Keyboard,
  LayoutDashboard,
  Layers,
  LibraryBig,
  MoreVertical,
  Maximize2,
  Minimize2,
  NotebookPen,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Save,
  Target,
  Trash2,
  Trophy,
  Upload,
  UserCircle,
  X,
  Zap,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import {
  buildAnswersFromResult,
  buildQuizInsight,
  buildQuizInsightRequest,
  buildQuizResultPayload,
  buildReviewFolderCards,
  buildSummaryDisplaySections,
  capitalize,
  cleanDisplaySentence,
  cleanTopicTitle,
  copyTextToClipboard,
  exportSummaryPdf,
  findReviewGroup,
  formatDate,
  formatDateTime,
  formatDuration,
  formatFileSize,
  formatFileType,
  formatQuizAnswer,
  formatRelativeTimestamp,
  getScoreBand,
  normalizeDisplayFileName,
  readQuizResult,
  saveQuizResult
} from "./utils/appHelpers.js";
import { getActiveTextMaterialId, setActiveTextMaterialId } from "./utils/activeMaterial.js";
import { useAutoDismissMessage, useAutoDismissStatus } from "./utils/hooks.js";
import { LoadingBanner, LoadingButton, LoadingSpinner } from "./components/Loading.jsx";
import { DashboardSkeleton, FlashcardsSkeleton, QuizSkeleton, SummarySkeleton } from "./components/Skeletons.jsx";
import { EmptyDataBanner, EmptyPanel, ErrorState } from "./components/States.jsx";
import ConfirmationModal from "./components/ConfirmationModal.jsx";
import { MoveFolderDropdown } from "./components/GoalDropdown.jsx";
import Header from "./components/Header.jsx";
import Sidebar from "./components/Sidebar.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import DashboardContent from "./pages/DashboardContent.jsx";
import HowItWorksPage from "./pages/HowItWorksPage.jsx";
import NotesPage from "./pages/NotesPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import UploadTextPage from "./pages/UploadTextPage.jsx";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const navigationItems = [
  { label: "Dashboard", icon: LayoutDashboard, page: "dashboard", href: "#dashboard" },
  { label: "Library", icon: LibraryBig, page: "library", href: "#library" },
  { label: "Upload as Text", icon: Keyboard, page: "upload-text", href: "#upload-text" },
  { label: "Summary", icon: FileText, page: "summary", href: "#summary" },
  { label: "Flashcards", icon: BookOpen, page: "flashcards", href: "#flashcards" },
  { label: "Quizzes", icon: Brain, page: "quizzes", href: "#quizzes" },
  { label: "Review", icon: Bookmark, page: "review", href: "#review" },
  { label: "Notes", icon: NotebookPen, page: "notes", href: "#notes" },
  { label: "Profile", icon: UserCircle, page: "profile", href: "#profile" }
];

const statConfig = [
  { key: "documentsUploaded", label: "PDFs in Library", icon: LibraryBig },
  { key: "quizAttempts", label: "Quiz Attempts", icon: Target },
  { key: "averageScore", label: "Average Score", icon: ChartNoAxesCombined, suffix: "%" },
  { key: "studyStreak", label: "Study Streak", icon: Flame }
];

const QUIZ_INSIGHT_FALLBACK = "We couldn't generate an AI insight for this attempt. Review the incorrect and unanswered questions below, then retake the quiz after revising the summary.";
// Main shell that restores auth, tracks navigation, and renders protected pages.
export default function App() {
  const [page, setPage] = useState(getPageFromHash());
  const [auth, setAuth] = useState({
    status: "checking",
    user: null
  });
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
  const liveStudySeconds = useStudyActivityTracker(page, auth.status === "authenticated");

  // Keeps the active page in sync with hash navigation.
  useEffect(() => {
    const handleHashChange = () => setPage(getPageFromHash());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // Lets pages refresh dashboard stats after uploads, quizzes, notes, or reviews change data.
  useEffect(() => {
    const handleDashboardRefresh = () => setDashboardRefreshToken((token) => token + 1);
    window.addEventListener("studymind:dashboard-refresh", handleDashboardRefresh);
    return () => window.removeEventListener("studymind:dashboard-refresh", handleDashboardRefresh);
  }, []);

  // Saves the sidebar preference so navigation feels consistent after reloads.
  useEffect(() => {
    try {
      localStorage.setItem("sidebarCollapsed", String(sidebarCollapsed));
    } catch {
      // Sidebar preference is nice-to-have; keep the UI working if storage is blocked.
    }
  }, [sidebarCollapsed]);

  // Loads the logged-in user when the app starts.
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const response = await fetch("/api/auth/me");
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Session not found.");
        }

        if (!cancelled) {
          setAuth({ status: "authenticated", user: data.user });
        }
      } catch {
        if (!cancelled) {
          setAuth({ status: "unauthenticated", user: null });
        }
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  // Loads dashboard data only when a protected dashboard/profile view needs it.
  useEffect(() => {
    if (auth.status !== "authenticated" || !["dashboard", "profile"].includes(page)) {
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
  }, [auth.status, page, dashboardRefreshToken]);

  const user = dashboard?.user || auth.user;

  // Stores the authenticated user returned from login or signup.
  async function handleAuthenticated(userData) {
    setDashboard(null);
    setAuth({ status: "authenticated", user: userData });
    window.location.hash = "#dashboard";
  }

  // Updates profile data in local app state after the profile form is saved.
  function handleProfileUpdated(userData) {
    setAuth({ status: "authenticated", user: userData });
    setDashboard((current) => current ? { ...current, user: userData } : current);
  }

  // Logs out on the backend, then clears protected frontend state.
  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setDashboard(null);
      setAuth({ status: "unauthenticated", user: null });
      window.location.hash = "#dashboard";
    }
  }

  if (auth.status === "checking") {
    return (
      <div className="auth-shell">
        <div className="auth-loading-card">
          <div className="brand-mark">
            <GraduationCap size={24} />
          </div>
          <strong>StudyMind AI</strong>
          <LoadingBanner
            compact
            title="Restoring your session"
            detail="Checking your secure study workspace."
          />
        </div>
      </div>
    );
  }

  if (auth.status !== "authenticated") {
    return <AuthPage onAuthenticated={handleAuthenticated} />;
  }

  // Routes authenticated users to the selected page component.
  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <Sidebar
        user={user}
        activePage={page}
        collapsed={sidebarCollapsed}
        navigationItems={navigationItems}
        getNavigationHref={getNavigationHref}
        onLogout={handleLogout}
        onToggle={() => setSidebarCollapsed((value) => !value)}
      />
      <main className={`dashboard-main ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        {page === "summary" ? (
          <SummaryPage />
        ) : page === "library" ? (
          <LibraryPage />
        ) : page === "upload-text" ? (
          <UploadTextPage />
        ) : page === "quizzes" ? (
          <QuizPage />
        ) : page === "quiz-results" ? (
          <QuizResultsPage />
        ) : page === "flashcards" ? (
          <FlashcardsPage />
        ) : page === "review" ? (
          <ReviewPage />
        ) : page === "notes" ? (
          <NotesPage />
        ) : page === "how-it-works" ? (
          <HowItWorksPage />
        ) : page === "profile" ? (
          <ProfilePage
            user={user}
            dashboard={dashboard}
            status={status}
            error={error}
            liveStudySeconds={liveStudySeconds}
            onLogout={handleLogout}
            onProfileUpdated={handleProfileUpdated}
          />
        ) : (
          <>
            <Header user={user} uploadState={uploadState} setUploadState={setUploadState} />
            {status === "loading" && (
              <>
                <LoadingBanner
                  title="Loading dashboard"
                  detail="Gathering your study progress and recent activity."
                />
                <DashboardSkeleton stats={statConfig} />
              </>
            )}
            {status === "error" && <ErrorState message={error} />}
            {status === "success" && dashboard && (
              <DashboardContent dashboard={dashboard} liveStudySeconds={liveStudySeconds} statConfig={statConfig} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

// Converts the current URL hash into the active page name.
function getPageFromHash() {
  const hash = window.location.hash.replace("#", "").split("?")[0];
  return hash || "dashboard";
}

// Reads query parameters from the hash, such as documentId or quizId.
function getHashParams() {
  const query = window.location.hash.split("?")[1] || "";
  return new URLSearchParams(query);
}

// Adds the active document id to study links that need source material context.
function getNavigationHref(item) {
  if (!["summary", "quizzes", "flashcards"].includes(item.page)) {
    return item.href;
  }

  const documentId = getActiveTextMaterialId();
  return documentId ? `${item.href}?documentId=${encodeURIComponent(documentId)}` : item.href;
}

// Tracks active study time and periodically reports it to the dashboard backend.
function useStudyActivityTracker(page, enabled = true) {
  const [liveSeconds, setLiveSeconds] = useState(0);
  const lastActivityRef = useRef(Date.now());
  const lastTickRef = useRef(Date.now());
  const pendingSecondsRef = useRef(0);
  const sourceRef = useRef(page || "dashboard");

  // Keeps the activity source aligned with the current page.
  useEffect(() => {
    sourceRef.current = page || "dashboard";
  }, [page]);

  // Counts visible active time and flushes it before the tab closes.
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

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
  }, [enabled]);

  return liveSeconds;
}

// Manages subject folders, PDFs, and selected-document AI generation.
function LibraryPage() {
  const [folders, setFolders] = useState([]);
  const [reviewFolderCards, setReviewFolderCards] = useState([]);
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
  const [folderModal, setFolderModal] = useState(null);
  const [folderModalStatus, setFolderModalStatus] = useState("idle");
  const [folderModalError, setFolderModalError] = useState("");
  const fileInputRef = useRef(null);
  useAutoDismissMessage(message, setMessage);

  // Loads folder cards when the Library page opens.
  useEffect(() => {
    loadFolders();
  }, []);

  // Loads Library folders and review counts used by the folder cards.
  async function loadFolders() {
    try {
      setStatus("loading");
      const [response, reviewCards] = await Promise.all([
        fetch("/api/folders"),
        loadReviewFolderCards()
      ]);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to load folders.");
      }

      setFolders(data.folders || []);
      setReviewFolderCards(reviewCards);
      setStatus("success");
    } catch (requestError) {
      setMessage({ type: "error", text: requestError.message || "Unable to load folders." });
      setStatus("error");
    }
  }

  // Opens one folder and loads only its PDFs from the backend.
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

  // Prepares the folder modal for creating a new folder.
  function createFolder() {
    setFolderModal({ mode: "create", folder: null });
    setFolderModalError("");
  }

  // Prepares the folder modal with the selected folder name.
  function renameFolder(folder) {
    setFolderModal({ mode: "rename", folder });
    setFolderModalError("");
  }

  function closeFolderModal() {
    if (folderModalStatus === "loading") {
      return;
    }

    setFolderModal(null);
    setFolderModalError("");
  }

  // Saves a new folder or renamed folder through the folder API.
  async function submitFolderModal(name) {
    const cleanName = name.trim();

    if (!cleanName) {
      setFolderModalError("Enter a folder name.");
      return;
    }

    if (folderModal?.mode === "rename" && cleanName === folderModal.folder?.name) {
      closeFolderModal();
      return;
    }

    try {
      setFolderModalStatus("loading");
      setFolderModalError("");

      const isRename = folderModal?.mode === "rename";
      const endpoint = isRename ? `/api/folders/${folderModal.folder.id}` : "/api/folders";
      const response = await fetch(endpoint, {
        method: isRename ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cleanName })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `Unable to ${isRename ? "rename" : "create"} folder.`);
      }

      setMessage({ type: "success", text: isRename ? "Folder renamed." : "Folder created." });
      await loadFolders();

      if (isRename && selectedFolder?.id === folderModal.folder.id) {
        await openFolder(data.folder);
      }

      setFolderModal(null);
    } catch (requestError) {
      setFolderModalError(requestError.message || "Unable to save folder.");
    } finally {
      setFolderModalStatus("idle");
    }
  }

  // Deletes an empty folder after confirmation.
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
      window.dispatchEvent(new Event("studymind:dashboard-refresh"));

      if (selectedFolder?.id === folder.id) {
        setSelectedFolder(null);
        setFolderDocuments([]);
      }

      await loadFolders();
    } catch (requestError) {
      setMessage({ type: "error", text: requestError.message || "Unable to delete folder." });
    }
  }

  // Uploads selected PDFs into the currently open folder.
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
      window.dispatchEvent(new Event("studymind:dashboard-refresh"));
      await Promise.all([loadFolders(), openFolder(selectedFolder)]);
    } catch (uploadError) {
      setMessage({ type: "error", text: uploadError.message || "Upload failed." });
    } finally {
      setUploadState("idle");
    }
  }

  // Handles the hidden file input used by the Library upload button.
  async function handlePdfUpload(event) {
    await uploadFiles(event.target.files);
    event.target.value = "";
  }

  // Moves selected PDFs to another folder and refreshes the Library data.
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
      window.dispatchEvent(new Event("studymind:dashboard-refresh"));
      await Promise.all([loadFolders(), openFolder(selectedFolder)]);
    } catch (requestError) {
      setMessage({ type: "error", text: requestError.message || "Unable to move PDFs." });
    }
  }

  // Renames one PDF and updates the visible table row.
  async function renameDocument(documentToRename, displayName) {
    const cleanName = normalizeDisplayFileName(displayName);

    if (!cleanName) {
      throw new Error("File name cannot be empty.");
    }

    if (cleanName.length > 100) {
      throw new Error("File name must be 100 characters or fewer.");
    }

    const response = await fetch(`/api/documents/${documentToRename.documentId}/rename`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: cleanName })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Unable to rename PDF.");
    }

    const renamedDocument = data.document || {};
    setFolderDocuments((currentDocuments) => currentDocuments.map((item) => (
      item.documentId === documentToRename.documentId
        ? { ...item, ...renamedDocument }
        : item
    )));
    setActivePdf((currentPdf) => (
      currentPdf?.documentId === documentToRename.documentId
        ? { ...currentPdf, ...renamedDocument }
        : currentPdf
    ));
    setMessage({ type: "success", text: data.message || "PDF renamed." });
    window.dispatchEvent(new Event("studymind:dashboard-refresh"));
    await loadFolders();

    return renamedDocument;
  }

  // Deletes selected PDFs and refreshes the folder table.
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
      window.dispatchEvent(new Event("studymind:dashboard-refresh"));
      await Promise.all([loadFolders(), openFolder(selectedFolder)]);
    } catch (requestError) {
      setMessage({ type: "error", text: requestError.message || "Unable to delete PDFs." });
    }
  }

  // Sends the selected PDF ids to the backend for summary, quiz, or flashcard generation.
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
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadState === "loading"}
            type="button"
          >
            {uploadState === "loading" ? <LoadingSpinner size="sm" /> : <Upload size={18} />}
            <span>Upload PDFs</span>
          </button>
          <button className="library-secondary-action" type="button" onClick={createFolder}>
            <Plus size={18} />
            <span>New Folder</span>
          </button>
        </div>
      </header>

      {message.text && message.type === "idle" && (
        <LoadingBanner
          title={
            message.text.toLowerCase().includes("upload")
              ? "Uploading PDF"
              : message.text.toLowerCase().includes("quiz")
                ? "Generating Quiz"
                : message.text.toLowerCase().includes("flashcard")
                  ? "Generating Flashcards"
                  : "Generating summary"
          }
          detail={
            message.text.toLowerCase().includes("upload")
              ? "Analyzing content..."
              : message.text.toLowerCase().includes("quiz")
                ? "Creating questions from your study material."
                : message.text.toLowerCase().includes("flashcard")
                  ? "Extracting key concepts for revision."
                  : "Analyzing content and preparing AI insights."
          }
        />
      )}
      {message.text && message.type !== "idle" && (
        <div className={`library-message ${message.type}`}>
          {message.text}
        </div>
      )}

      {/* Shows folder details after a folder is opened, otherwise shows the folder grid. */}
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
          onRenameDocument={renameDocument}
          onRename={renameFolder}
          onGenerateSelected={generateFromSelected}
          onSelectDocuments={setSelectedDocumentIds}
          onSetMoveTarget={setMoveTargetId}
          onUploadFiles={uploadFiles}
          onViewPdf={setActivePdf}
          reviewFolderCards={reviewFolderCards}
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
          reviewFolderCards={reviewFolderCards}
          status={status}
        />
      )}
      {activePdf && (
        <PdfViewerModal
          document={activePdf}
          onClose={() => setActivePdf(null)}
        />
      )}
      {folderModal && (
        <FolderNameModal
          error={folderModalError}
          initialName={folderModal.folder?.name || ""}
          mode={folderModal.mode}
          onClose={closeFolderModal}
          onSubmit={submitFolderModal}
          status={folderModalStatus}
        />
      )}
    </div>
  );
}

// Modal shared by create-folder and rename-folder flows.
function FolderNameModal({ error, initialName = "", mode, onClose, onSubmit, status }) {
  const [name, setName] = useState(initialName);
  const inputRef = useRef(null);
  const isRename = mode === "rename";
  const isLoading = status === "loading";

  // Focuses the folder name field and lets Escape close the modal.
  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Sends the typed folder name back to LibraryPage.
  function handleSubmit(event) {
    event.preventDefault();
    onSubmit(name);
  }

  return (
    <div className="folder-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    }}>
      <form className="folder-name-modal" role="dialog" aria-modal="true" aria-labelledby="folder-modal-title" onSubmit={handleSubmit}>
        <button className="folder-modal-close" type="button" aria-label="Close folder modal" onClick={onClose} disabled={isLoading}>
          <X size={18} />
        </button>
        <div className="folder-modal-copy">
          <h2 id="folder-modal-title">{isRename ? "Rename Folder" : "Create New Folder"}</h2>
          <p>{isRename ? "Update the folder name." : "Organize your study materials into a subject folder."}</p>
        </div>
        <label className="folder-modal-field">
          <span>Folder name</span>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Enter folder name"
            disabled={isLoading}
          />
        </label>
        {error && <p className="folder-modal-error">{error}</p>}
        <div className="folder-modal-actions">
          <button className="folder-modal-secondary" type="button" onClick={onClose} disabled={isLoading}>Cancel</button>
          <LoadingButton
            className="folder-modal-primary"
            isLoading={isLoading}
            loadingLabel={isRename ? "Renaming" : "Creating"}
            type="submit"
          >
            {isRename ? "Rename Folder" : "Create Folder"}
          </LoadingButton>
        </div>
      </form>
    </div>
  );
}

// Loads saved-summary and marked-question counts shown on Library folder cards.
async function loadReviewFolderCards() {
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

  return buildReviewFolderCards(summaryData.folders || [], questionData.folders || []);
}

// Finds review counts for one folder, or returns zero counts.
function getFolderReviewInfo(reviewFolderCards, folder) {
  return reviewFolderCards.find((item) => item.folderId === folder.id) || {
    folderId: folder.id,
    folderName: folder.name,
    savedSummaryCount: 0,
    markedQuestionCount: 0
  };
}

// Links a folder to the Review Center when it has saved content.
function ReviewContentLink({ folder, reviewInfo, className = "" }) {
  const reviewCount = (reviewInfo?.savedSummaryCount || 0) + (reviewInfo?.markedQuestionCount || 0);
  const isDisabled = reviewCount === 0;
  const reviewHref = `#review?folderId=${encodeURIComponent(folder.id)}&folderName=${encodeURIComponent(folder.name)}`;
  const label = reviewCount > 0 ? `Review Content (${reviewCount})` : "Review Content";
  const tooltip = "No saved content";
  const classes = ["folder-review-link", className, isDisabled ? "disabled" : ""].filter(Boolean).join(" ");

  if (isDisabled) {
    return (
      <a
        aria-disabled="true"
        className={classes}
        data-tooltip={tooltip}
        onClick={(event) => event.preventDefault()}
        role="link"
        tabIndex={0}
      >
        <Bookmark size={16} />
        <span>{label}</span>
      </a>
    );
  }

  return (
    <a className={classes} href={reviewHref}>
      <Bookmark size={16} />
      <span>{label}</span>
    </a>
  );
}

// Shows the top-level Library folder cards.
function FolderGrid({ folders, onDelete, onOpen, onRename, reviewFolderCards, status }) {
  if (status === "loading") {
    return (
      <>
        <LoadingBanner
          title="Loading folders"
          detail="Fetching your study library and folder structure."
        />
        <section className="folder-grid" aria-busy="true">
          {[0, 1, 2].map((item) => (
            <div className="folder-card skeleton-panel" key={item} />
          ))}
        </section>
      </>
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
              <button
                aria-label={`Rename ${folder.name} folder`}
                title="Rename folder"
                type="button"
                onClick={() => onRename(folder)}
              >
                <Pencil size={15} />
                <span>Rename Folder</span>
              </button>
              <button
                aria-label={`Delete ${folder.name} folder`}
                title="Delete folder"
                type="button"
                onClick={() => onDelete(folder)}
              >
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

// Shows PDFs inside one folder and exposes upload, select, move, delete, and AI actions.
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
  onRenameDocument,
  onSelectDocuments,
  onSetMoveTarget,
  onUploadFiles,
  onViewPdf,
  reviewFolderCards,
  selectedDocumentIds,
  status,
  uploadState
}) {
  const [renamingDocumentId, setRenamingDocumentId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState("");
  const selectableDocuments = documents.map((document) => document.documentId);
  const allSelected = selectableDocuments.length > 0
    && selectableDocuments.every((id) => selectedDocumentIds.includes(id));
  const destinationFolders = folders.filter((item) => item.id !== folder.id);
  const reviewInfo = getFolderReviewInfo(reviewFolderCards, folder);

  // Adds or removes one PDF from the selected document list.
  function toggleDocument(id) {
    onSelectDocuments(
      selectedDocumentIds.includes(id)
        ? selectedDocumentIds.filter((selectedId) => selectedId !== id)
        : [...selectedDocumentIds, id]
    );
  }

  // Selects all folder PDFs, or clears the selection if all are selected.
  function toggleAll() {
    onSelectDocuments(allSelected ? [] : selectableDocuments);
  }

  // Lets clicking a table row toggle selection without stealing clicks from controls.
  function handleRowClick(event, id) {
    if (event.target.closest("a, button, input, select")) {
      return;
    }

    toggleDocument(id);
  }

  // Lets keyboard users select rows with Enter or Space.
  function handleRowKeyDown(event, id) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleDocument(id);
    }
  }

  // Sends dropped PDF files through the same upload flow as the file input.
  function handleDrop(event) {
    event.preventDefault();
    onUploadFiles(event.dataTransfer.files);
  }

  // Opens the inline rename editor for one PDF row.
  function startRename(documentToRename) {
    setRenamingDocumentId(documentToRename.documentId);
    setRenameValue(normalizeDisplayFileName(documentToRename.displayName || documentToRename.fileName || documentToRename.title));
    setRenameError("");
  }

  function cancelRename() {
    setRenamingDocumentId(null);
    setRenameValue("");
    setRenameError("");
    setRenameSaving(false);
  }

  // Validates and saves the inline PDF rename.
  async function saveRename(documentToRename) {
    const cleanName = normalizeDisplayFileName(renameValue);
    const currentName = normalizeDisplayFileName(documentToRename.displayName || documentToRename.fileName || documentToRename.title);

    if (!cleanName) {
      setRenameError("Enter a file name.");
      return;
    }

    if (cleanName.length > 100) {
      setRenameError("Use 100 characters or fewer.");
      return;
    }

    if (cleanName === currentName) {
      cancelRename();
      return;
    }

    try {
      setRenameSaving(true);
      setRenameError("");
      await onRenameDocument(documentToRename, cleanName);
      cancelRename();
    } catch (requestError) {
      setRenameError(requestError.message || "Unable to rename PDF.");
      setRenameSaving(false);
    }
  }

  // Saves or cancels inline rename from the keyboard.
  function handleRenameKeyDown(event, documentToRename) {
    event.stopPropagation();

    if (event.key === "Enter") {
      event.preventDefault();
      saveRename(documentToRename);
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelRename();
    }
  }

  return (
    <section className="folder-detail">
      <div className="folder-detail-heading">
        <button className="folder-back-button" type="button" onClick={onBack}>
          <span aria-hidden="true">◀</span>
          <span>Back to folders</span>
        </button>
        <div>
          <h2>{folder.name}</h2>
          <p>{folder.documentCount} {folder.documentCount === 1 ? "PDF" : "PDFs"}</p>
        </div>
        <div className="folder-detail-actions">
          <ReviewContentLink folder={folder} reviewInfo={reviewInfo} />
          <button
            aria-label={`Rename ${folder.name} folder`}
            title="Rename folder"
            type="button"
            onClick={() => onRename(folder)}
          >
            <Pencil size={16} />
            <span>Rename</span>
          </button>
          <button
            aria-label={`Delete ${folder.name} folder`}
            title="Delete folder"
            type="button"
            onClick={() => onDelete(folder)}
          >
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
        <button
          disabled={uploadState === "loading"}
          onClick={() => document.querySelector(".library-actions .file-input")?.click()}
          type="button"
        >
          <Upload size={17} />
          <span>Upload PDF</span>
        </button>
      </div>

      {status === "loading" ? (
        <>
          <LoadingBanner
            title="Loading folder"
            detail="Fetching PDFs and available study actions."
          />
          <div className="pdf-table-card skeleton-panel" aria-busy="true" />
        </>
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
              <LoadingButton
                isLoading={aiAction === "summary"}
                loadingLabel="Generating"
                onClick={() => onGenerateSelected("summary")}
                disabled={!selectedDocumentIds.length || aiAction !== "idle"}
                type="button"
              >
                Generate Summary
              </LoadingButton>
              <LoadingButton
                isLoading={aiAction === "quiz"}
                loadingLabel="Generating"
                onClick={() => onGenerateSelected("quiz")}
                disabled={!selectedDocumentIds.length || aiAction !== "idle"}
                type="button"
              >
                Generate Quiz
              </LoadingButton>
              <LoadingButton
                isLoading={aiAction === "flashcards"}
                loadingLabel="Generating"
                onClick={() => onGenerateSelected("flashcards")}
                disabled={!selectedDocumentIds.length || aiAction !== "idle"}
                type="button"
              >
                Generate Flashcards
              </LoadingButton>
            </div>
            <div>
              <MoveFolderDropdown
                disabled={!selectedDocumentIds.length || !destinationFolders.length}
                label="Move selected PDFs to folder"
                onChange={(nextFolderId) => {
                  onSetMoveTarget(nextFolderId);

                  if (nextFolderId && selectedDocumentIds.length) {
                    onMoveDocuments(selectedDocumentIds, nextFolderId);
                  }
                }}
                options={destinationFolders}
                placeholder="Move to folder..."
                value={moveTargetId}
              />
              <button type="button" onClick={() => onDeleteDocuments(selectedDocumentIds)} disabled={!selectedDocumentIds.length}>
                Delete Selected
              </button>
            </div>
          </div>
          <div className="pdf-table-card">
            <table className="pdf-table">
              <thead>
                <tr>
                  <th className="pdf-checkbox-cell" aria-hidden="true" />
                  <th>File Name</th>
                  <th>Pages</th>
                  <th>Size</th>
                  <th>Uploaded On</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((document) => (
                  <tr
                    className={selectedDocumentIds.includes(document.documentId) ? "selected" : ""}
                    key={document.id}
                    tabIndex={0}
                    onClick={(event) => handleRowClick(event, document.documentId)}
                    onKeyDown={(event) => handleRowKeyDown(event, document.documentId)}
                  >
                    <td className="pdf-checkbox-cell">
                      <input
                        aria-label={`Select ${document.fileName}`}
                        checked={selectedDocumentIds.includes(document.documentId)}
                        onChange={() => toggleDocument(document.documentId)}
                        type="checkbox"
                      />
                    </td>
                    <td>
                      {renamingDocumentId === document.documentId ? (
                        <div className="pdf-rename-editor">
                          <input
                            aria-label={`Rename ${document.fileName}`}
                            autoFocus
                            maxLength={100}
                            onChange={(event) => {
                              setRenameValue(event.target.value);
                              setRenameError("");
                            }}
                            onKeyDown={(event) => handleRenameKeyDown(event, document)}
                            type="text"
                            value={renameValue}
                          />
                          <button
                            aria-label="Save renamed file"
                            className="pdf-rename-icon-button save"
                            disabled={renameSaving}
                            onClick={() => saveRename(document)}
                            title="Save"
                            type="button"
                          >
                            <Check size={15} />
                          </button>
                          <button
                            aria-label="Cancel rename"
                            className="pdf-rename-icon-button"
                            disabled={renameSaving}
                            onClick={cancelRename}
                            title="Cancel"
                            type="button"
                          >
                            <X size={15} />
                          </button>
                          {renameError && <span className="pdf-rename-error">{renameError}</span>}
                        </div>
                      ) : (
                        <div className="pdf-file-name-cell">
                          <a href={`#summary?documentId=${document.documentId}`}>{document.fileName}</a>
                          <button
                            aria-label={`Rename ${document.fileName}`}
                            className="pdf-rename-trigger"
                            onClick={() => startRename(document)}
                            title="Rename file"
                            type="button"
                          >
                            <Pencil size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                    <td>{document.pageCount || "—"}</td>
                    <td>{formatFileSize(document.fileSize)}</td>
                    <td>{formatDate(document.uploadDate)}</td>
                    <td>
                      <div className="pdf-row-actions">
                        <button type="button" onClick={() => onViewPdf(document)}>View PDF</button>
                        <a href={`#summary?documentId=${document.documentId}`}>Summary</a>
                        <MoveFolderDropdown
                          disabled={!destinationFolders.length}
                          label={`Move ${document.fileName}`}
                          onChange={(nextFolderId) => {
                            if (nextFolderId) {
                              onMoveDocuments([document.documentId], nextFolderId);
                            }
                          }}
                          options={destinationFolders}
                          placeholder="Move"
                          value=""
                        />
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

// Review Center lists saved summaries and marked quiz questions by folder.
function ReviewPage() {
  const requestedReviewTab = getHashParams().get("tab") === "questions" ? "questions" : "summaries";
  const requestedFolderId = getHashParams().get("folderId") || "";
  const requestedFolderName = getHashParams().get("folderName") || "";
  const [summaryGroups, setSummaryGroups] = useState([]);
  const [questionGroups, setQuestionGroups] = useState([]);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState({ type: "idle", text: "" });
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [activeTab, setActiveTab] = useState(requestedReviewTab);
  useAutoDismissMessage(message, setMessage);

  // Loads Review Center data when the page opens.
  useEffect(() => {
    loadReviewData();
  }, []);

  // Loads saved summaries and marked questions in parallel.
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

  // Removes one saved summary from Review Center.
  async function removeSavedSummary(id) {
    await removeReviewItem(`/api/review/summaries/${id}`, "Saved summary removed.");
  }

  // Removes one marked question from Review Center.
  async function removeMarkedQuestion(id) {
    await removeReviewItem(`/api/review/questions/${id}`, "Marked question removed.");
  }

  // Deletes one review item, then reloads grouped review data.
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

  const folderCards = useMemo(
    () => buildReviewFolderCards(summaryGroups, questionGroups),
    [summaryGroups, questionGroups]
  );

  // Opens the requested folder when Library links into Review Center.
  useEffect(() => {
    if (status !== "success" || !requestedFolderId) {
      return;
    }

    const matchingFolder = folderCards.find((folder) => folder.folderId === requestedFolderId) || {
      key: requestedFolderId,
      folderId: requestedFolderId,
      folderName: requestedFolderName || "Selected Folder",
      savedSummaryCount: 0,
      markedQuestionCount: 0
    };

    if (matchingFolder && selectedFolder?.key !== matchingFolder.key) {
      setSelectedFolder(matchingFolder);
      setActiveTab(requestedReviewTab);
    }
  }, [folderCards, requestedFolderId, requestedFolderName, requestedReviewTab, selectedFolder?.key, status]);

  // Derives the selected folder's saved summaries and marked questions for the active tab.
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
          {currentFolder && (
            <button
              className="review-back-button"
              type="button"
              onClick={() => {
                window.location.hash = "#review";
                setSelectedFolder(null);
                setActiveTab("summaries");
              }}
            >
              ← Back to Review Center
            </button>
          )}
        </div>
      </header>

      {message.text && (
        <div className={`library-message ${message.type}`}>
          {message.text}
        </div>
      )}

      {status === "loading" ? (
        <>
          <LoadingBanner
            title="Loading review center"
            detail="Gathering saved summaries and marked questions."
          />
          <div className="review-folder-grid" aria-busy="true">
            <div className="review-folder-card skeleton-panel" />
            <div className="review-folder-card skeleton-panel" />
            <div className="review-folder-card skeleton-panel" />
          </div>
        </>
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
                  setActiveTab(requestedReviewTab);
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
                text="No marked questions available in this folder."
              />
            )
          )}
        </section>
      )}
    </div>
  );
}

// Displays a protected PDF in a modal using PDF.js.
function PdfViewerModal({ document, onClose }) {
  const [pdfDocument, setPdfDocument] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [scale, setScale] = useState(1.05);
  const [currentPage, setCurrentPage] = useState(1);
  const pageRefs = useRef([]);
  const viewerRef = useRef(null);
  const documentId = document.documentId || document.id;
  const pdfUrl = document.pdfUrl || (documentId ? `/api/documents/${documentId}/pdf` : "");
  const downloadUrl = pdfUrl ? `${pdfUrl}?download=1` : "#";

  // Loads the selected PDF from the backend-owned document URL.
  useEffect(() => {
    let cancelled = false;
    let loadingTask;

    async function loadPdf() {
      try {
        setStatus("loading");
        setError("");
        setPdfDocument(null);

        if (!documentId || !pdfUrl) {
          console.debug("[PDF Viewer] Missing PDF URL", {
            documentId,
            document
          });
          throw new Error("PDF URL is missing for this document.");
        }

        console.debug("[PDF Viewer] Loading PDF", {
          documentId,
          storedFileName: document.storedFileName,
          filePath: document.filePath,
          fileUrl: document.fileUrl,
          pdfUrl
        });

        loadingTask = pdfjsLib.getDocument({ url: pdfUrl });
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
      loadingTask?.destroy();
    };
  }, [document, documentId, pdfUrl]);

  // Lets Escape close the PDF modal.
  useEffect(() => {
    function handleKeydown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [onClose]);

  // Scrolls to a specific PDF page while keeping the page number valid.
  function goToPage(pageNumber) {
    const nextPage = Math.min(Math.max(pageNumber, 1), pdfDocument?.numPages || 1);
    setCurrentPage(nextPage);
    pageRefs.current[nextPage - 1]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Updates the current page indicator based on scroll position.
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
              <LoadingBanner
                title="Loading original PDF"
                detail="Preparing pages for viewing."
              />
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

// Renders one PDF page to canvas for the PDF viewer.
function PdfCanvasPage({ pdfDocument, pageNumber, scale }) {
  const canvasRef = useRef(null);
  const [renderError, setRenderError] = useState("");

  // Re-renders the canvas when the page or zoom level changes.
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

// Loads and manages AI summaries, summary actions, exports, and AI tutor chat.
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
    message: "",
    pdfType: ""
  });
  const [pdfMenuOpen, setPdfMenuOpen] = useState(false);
  const [deleteState, setDeleteState] = useState({
    status: "idle",
    message: ""
  });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [savedSummary, setSavedSummary] = useState(null);
  const [saveSummaryState, setSaveSummaryState] = useState({
    status: "idle",
    message: ""
  });
  const [copySummaryState, setCopySummaryState] = useState({
    status: "idle",
    message: ""
  });
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatStatus, setChatStatus] = useState("idle");
  const [chatError, setChatError] = useState("");
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const chatRef = useRef(null);
  const pdfMenuRef = useRef(null);
  const chatScrollPositions = useRef({ compact: 0, expanded: 0 });
  useAutoDismissStatus(quizGeneration, setQuizGeneration);
  useAutoDismissStatus(flashcardGeneration, setFlashcardGeneration);
  useAutoDismissStatus(pdfExportState, setPdfExportState);
  useAutoDismissStatus(deleteState, setDeleteState);
  useAutoDismissStatus(saveSummaryState, setSaveSummaryState);
  useAutoDismissStatus(copySummaryState, setCopySummaryState);

  // Loads the selected summary whenever the document id or length changes.
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
        const data = await response.json().catch(() => ({}));

        if (response.status === 404 && !documentId) {
          setSummaryData(null);
          setError("");
          setStatus("empty");
          return;
        }

        if (!response.ok) {
          throw new Error(data.message || `Summary request failed with ${response.status}`);
        }

        setSummaryData(data);
        setError("");
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

  // Resets AI Tutor chat when the user switches documents.
  useEffect(() => {
    setChatMessages([]);
    setChatInput("");
    setChatStatus("idle");
    setChatError("");
  }, [documentId]);

  // Keeps text-generated material available to Quiz and Flashcards navigation.
  useEffect(() => {
    if (!summaryData?.document?.id) {
      return;
    }

    setActiveTextMaterialId(
      summaryData.document.fileType === "text" ? summaryData.document.id : ""
    );
  }, [summaryData?.document?.id, summaryData?.document?.fileType]);

  // Closes the PDF export menu when the user clicks outside it.
  useEffect(() => {
    function handleClickOutside(event) {
      if (pdfMenuRef.current && !pdfMenuRef.current.contains(event.target)) {
        setPdfMenuOpen(false);
      }
    }

    window.document.addEventListener("mousedown", handleClickOutside);

    return () => {
      window.document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Checks whether this summary is already saved in Review Center.
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

  // Regenerates the current summary length for the open document.
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

  // Generates a quiz from the current summary source and opens the quiz page.
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

  // Generates flashcards from the current summary source and opens the deck.
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

  // Requests AI-formatted notes, then downloads them as a PDF.
  async function handleDownloadPdf(pdfType) {
    try {
      const selectedPdfType = pdfType === "quick" ? "quick" : "detailed";
      const currentSummaryText = summaryData?.summary?.content?.[length]
        || summaryData?.summary?.displayedContent
        || "";

      if (!currentSummaryText.trim()) {
        throw new Error("Generate a summary before downloading a PDF.");
      }

      setPdfExportState({
        status: "loading",
        message: selectedPdfType === "quick" ? "Preparing Quick Revision PDF..." : "Preparing Detailed Notes PDF...",
        pdfType: selectedPdfType
      });
      setPdfMenuOpen(true);

      const response = await fetch("/api/summaries/pdf-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: document?.id,
          length,
          pdfType: selectedPdfType,
          summaryText: currentSummaryText
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to generate PDF notes.");
      }

      exportSummaryPdf({
        document,
        summary,
        length,
        summaryText: data.notes,
        pdfSections: data.sections,
        pdfType: selectedPdfType,
        generatedAt: data.meta?.generatedAt
      });
      setPdfExportState({
        status: "success",
        message: selectedPdfType === "quick" ? "Quick Revision PDF downloaded." : "Detailed Notes PDF downloaded.",
        pdfType: selectedPdfType
      });
      setPdfMenuOpen(false);
    } catch (pdfError) {
      setPdfExportState({
        status: "error",
        message: pdfError.message || "Unable to download summary PDF.",
        pdfType: pdfType === "quick" ? "quick" : "detailed"
      });
    }
  }

  // Toggles the current summary in the Review Center.
  async function handleSaveSummaryForReview() {
    if (summaryData?.document?.fileType === "text") {
      return;
    }

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

  // Deletes the stored summary and clears summary-specific UI state.
  async function handleDeleteSummary() {
    if (!summaryData?.summary?.id) {
      return;
    }

    try {
      setDeleteState({ status: "loading", message: "Deleting summary..." });
      const response = await fetch(`/api/summaries/${summaryData.summary.id}`, {
        method: "DELETE"
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to delete summary.");
      }

      setSummaryData((current) => ({
        ...current,
        summary: null,
        meta: {
          ...current.meta,
          hasSummary: false
        }
      }));
      setSavedSummary(null);
      setDeleteConfirmOpen(false);
      setDeleteState({ status: "success", message: data.message || "Summary deleted successfully." });
      window.dispatchEvent(new Event("studymind:dashboard-refresh"));
    } catch (deleteError) {
      setDeleteConfirmOpen(false);
      setDeleteState({ status: "error", message: deleteError.message || "Unable to delete summary." });
    }
  }

  // Sends the user's AI Tutor message with recent chat history.
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

  // Reuses an AI Tutor answer to ask for a shorter, exam, flashcard, or quiz version.
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
    return (
      <>
        <LoadingBanner
          title="Loading AI Summary"
          detail="Fetching document summary."
        />
        <SummarySkeleton />
      </>
    );
  }

  if (status === "error") {
    return (
      <section className="state-card">
        <strong>Summary could not load.</strong>
        <p>{error}</p>
      </section>
    );
  }

  // Copies the current summary in a clean notes-friendly format.
  async function handleCopySummary() {
    const currentSummaryText = summaryData?.summary?.content?.[length]
      || summaryData?.summary?.displayedContent
      || "";

    if (!currentSummaryText.trim()) {
      setCopySummaryState({ status: "error", message: "Generate a summary before copying it." });
      return;
    }

    try {
      const cleanSummary = formatSummaryForClipboard(
        summaryData?.document?.title || "Study Summary",
        currentSummaryText,
        length
      );
      await copyTextToClipboard(cleanSummary);
      setCopySummaryState({ status: "success", message: "Summary copied successfully" });
    } catch {
      setCopySummaryState({ status: "error", message: "Unable to copy summary." });
    }
  }

  if (status === "empty") {
    return (
      <section className="state-card">
        <EmptyPanel
          title="No study document yet."
          text="Upload a PDF from your Library to generate a summary."
        />
        <a className="summary-primary-action" href="#library">
          <LibraryBig size={17} />
          <span>Go to Library</span>
        </a>
      </section>
    );
  }

  const document = summaryData.document;
  const summary = summaryData.summary;
  const uploadedDate = formatDate(document.uploadedAt);
  const updatedLabel = formatRelativeTimestamp(summary?.updatedAt || document.updatedAt);

  return (
    <div className="summary-page">
      <header className="summary-header">
        <div className="summary-header-main">
          <span className="summary-breadcrumb">
            {document.fileType === "text" ? "Upload as Text" : "Library"} &gt; {document.title}
          </span>
          <h1>AI Summary</h1>
          <div className="summary-meta">
            <span>{document.fileType === "text" ? "Pasted Text" : `${formatFileType(document.fileType)} Document`}</span>
            {document.fileType !== "text" && (
              <span>
                {document.pageCount || 23} {(document.pageCount || 23) === 1 ? "Page" : "Pages"}
              </span>
            )}
            <span>Uploaded on {uploadedDate}</span>
          </div>
          <div className="summary-status-row">
            <span className="status-chip">{summary?.status || "No Summary Yet"}</span>
            <span className="updated-chip">{updatedLabel}</span>
          </div>
        </div>

        <div className="summary-header-actions">
          <div className="summary-header-action-row">
            <button
              className="summary-primary-action secondary"
              type="button"
              onClick={handleCopySummary}
              disabled={!summary}
            >
              <Copy size={17} />
              <span>Copy Summary</span>
            </button>
            <LoadingButton
              className="summary-primary-action"
              isLoading={isRegenerating}
              loadingLabel="Generating"
              onClick={handleGenerate}
              type="button"
            >
              <RefreshCw size={17} />
              <span>Regenerate Summary</span>
            </LoadingButton>
            <button
              className="summary-primary-action danger"
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={!summary || deleteState.status === "loading"}
            >
              <Trash2 size={17} />
              <span>Delete Summary</span>
            </button>
          </div>
          <div className="summary-header-action-row">
            <LoadingButton
              className={`summary-primary-action secondary${document.fileType === "text" ? " text-revision-disabled" : ""}`}
              isLoading={saveSummaryState.status === "loading"}
              loadingLabel={savedSummary ? "Removing" : "Saving"}
              onClick={handleSaveSummaryForReview}
              disabled={document.fileType === "text" || !summary || saveSummaryState.status === "loading"}
              title={document.fileType === "text"
                ? "Mark for Revision is available for uploaded PDFs only."
                : undefined}
              type="button"
            >
              <Bookmark size={19} />
              <span>
                {document.fileType === "text"
                  ? "Upload PDF to Mark"
                  : savedSummary ? "Saved" : "Save for Revision"}
              </span>
            </LoadingButton>
            <div className="summary-pdf-menu" ref={pdfMenuRef}>
              <button
                className="summary-primary-action secondary summary-pdf-trigger"
                type="button"
                aria-expanded={pdfMenuOpen}
                aria-haspopup="menu"
                onClick={() => setPdfMenuOpen((open) => !open)}
                disabled={!summary}
              >
                <Download size={17} />
                <span>Download PDF</span>
                <ChevronDown size={16} />
              </button>
              {pdfMenuOpen && (
                <div className="summary-pdf-popover" role="menu" aria-label="Choose PDF type">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleDownloadPdf("quick")}
                    disabled={pdfExportState.status === "loading"}
                  >
                    <span className="summary-pdf-option-icon">
                      {pdfExportState.status === "loading" && pdfExportState.pdfType === "quick" ? <LoadingSpinner size="sm" /> : <Zap size={18} />}
                    </span>
                    <span>
                      <strong>Quick PDF</strong>
                      <small>Short revision notes</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleDownloadPdf("detailed")}
                    disabled={pdfExportState.status === "loading"}
                  >
                    <span className="summary-pdf-option-icon">
                      {pdfExportState.status === "loading" && pdfExportState.pdfType === "detailed" ? <LoadingSpinner size="sm" /> : <FileText size={18} />}
                    </span>
                    <span>
                      <strong>Detailed PDF</strong>
                      <small>Full study notes</small>
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {isRegenerating && (
        <LoadingBanner
          title="Generating summary"
          detail="Analyzing content and preparing AI insights."
        />
      )}

      {pdfExportState.status === "loading" && (
        <LoadingBanner
          title={pdfExportState.message || "Preparing PDF"}
          detail="Formatting your summary for download."
          compact
        />
      )}
      {pdfExportState.status !== "idle" && pdfExportState.status !== "loading" && (
        <div className={`summary-export-status ${pdfExportState.status}`}>
          <span>{pdfExportState.message}</span>
        </div>
      )}

      {saveSummaryState.status === "loading" && (
        <LoadingBanner
          title={saveSummaryState.message || "Saving summary"}
          detail="Updating your review collection."
          compact
        />
      )}
      {saveSummaryState.status !== "idle" && saveSummaryState.status !== "loading" && (
        <div className={`summary-export-status ${saveSummaryState.status}`}>
          <span>{saveSummaryState.message}</span>
        </div>
      )}
      {copySummaryState.status !== "idle" && (
        <div className={`summary-export-status ${copySummaryState.status}`}>
          <span>{copySummaryState.message}</span>
        </div>
      )}

      {deleteState.status === "loading" && (
        <LoadingBanner
          title={deleteState.message || "Deleting summary"}
          detail="Updating your stored study material."
          compact
        />
      )}
      {deleteState.status !== "idle" && deleteState.status !== "loading" && (
        <div className={`summary-export-status ${deleteState.status}`}>
          <span>{deleteState.message}</span>
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
            <h2>AI Summary</h2>
          </div>
          <div className="summary-card-controls">
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
        </div>

        {summary ? (
          <div className="summary-scroll-panel collapsed">
            <SummarySections text={summary.content?.[length] || summary.displayedContent} length={length} />
          </div>
        ) : (
          <div className="summary-empty">
            <strong>No summary generated yet.</strong>
            <p>Generate a summary from the selected document to create readable study notes.</p>
            <LoadingButton
              isLoading={isRegenerating}
              loadingLabel="Generating"
              onClick={handleGenerate}
              type="button"
            >
              <RefreshCw size={17} />
              <span>Generate Summary</span>
            </LoadingButton>
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

      <section className="summary-actions-grid">
        <a className="summary-action-card" href={summaryData.links?.flashcards || "#flashcards"} onClick={handleGenerateFlashcards}>
          <div className="action-icon gold">
            <Layers size={24} />
          </div>
          <div>
            <h3>{flashcardGeneration.status === "loading" ? "Generating Flashcards" : "Generate Flashcards"}</h3>
            <p>{flashcardGeneration.status === "idle" ? "Create flashcards for quick revision of important concepts." : flashcardGeneration.message}</p>
          </div>
        </a>
        <a className="summary-action-card" href={summaryData.links?.quiz || "#quizzes"} onClick={handleGenerateQuiz}>
          <div className="action-icon blue">
            <Brain size={24} />
          </div>
          <div>
            <h3>{quizGeneration.status === "loading" ? "Generating Quiz" : "Generate Quiz"}</h3>
            <p>{quizGeneration.status === "idle" ? "Create MCQs from this content to test your understanding." : quizGeneration.message}</p>
          </div>
        </a>
      </section>

      {quizGeneration.status === "loading" && (
        <LoadingBanner
          title="Generating Quiz"
          detail="Creating questions from your study material."
        />
      )}
      {flashcardGeneration.status === "loading" && (
        <LoadingBanner
          title="Generating Flashcards"
          detail="Extracting key concepts for revision."
        />
      )}

      {deleteConfirmOpen && (
        <ConfirmationModal
          title="Delete Summary?"
          message={`This will permanently remove the generated summary. The original ${document.fileType === "text" ? "pasted text material" : "PDF"} will remain unchanged.`}
          confirmLabel="Delete"
          isConfirming={deleteState.status === "loading"}
          onCancel={() => setDeleteConfirmOpen(false)}
          onConfirm={handleDeleteSummary}
        />
      )}
    </div>
  );
}

// Displays summary text as readable titled sections.
function SummarySections({ text, length }) {
  const sections = buildSummaryDisplaySections(text, length);

  return (
    <div className={`summary-sections summary-sections-${length}`}>
      {sections.map((section, index) => (
        <article className="summary-section-block" key={`${section.title}-${index}`}>
          <h3>{section.title}</h3>
          <p>{section.text}</p>
        </article>
      ))}
    </div>
  );
}

// AI Tutor chat shown inside the Summary page.
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

  // Restores the previous scroll position when switching compact/expanded chat.
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

  // Keeps the latest chat message visible.
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

  // Saves chat scroll position separately for compact and expanded modes.
  function handleHistoryScroll(event) {
    if (scrollPositions?.current) {
      scrollPositions.current[scrollKey] = event.currentTarget.scrollTop;
    }
  }

  // Sends the typed chat prompt.
  function handleSubmit(event) {
    event.preventDefault();
    onSend();
  }

  // Sends on Enter while allowing Shift+Enter for a new line.
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
            <LoadingBanner
              compact
              title="AI Tutor is thinking"
              detail="Preparing a helpful explanation."
            />
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
        <LoadingButton
          isLoading={status === "loading"}
          loadingLabel="Thinking"
          type="submit"
          disabled={!input.trim()}
        >
          Send
        </LoadingButton>
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

// Labels whether an AI Tutor answer came from notes, summary, or general knowledge.
function formatSourceType(sourceType) {
  if (sourceType === "general") {
    return "🌐 General Knowledge";
  }

  if (sourceType === "summary") {
    return "📄 From Your Summary";
  }

  return "📄 From Your Notes";
}

// Loads quizzes, manages answers, submits attempts, and handles review marks.
function QuizPage() {
  const params = getHashParams();
  const documentId = params.get("documentId");
  const [quizData, setQuizData] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [answers, setAnswers] = useState({});
  const [attemptStartedAt, setAttemptStartedAt] = useState(Date.now());
  const [attemptResult, setAttemptResult] = useState(null);
  const [markedQuestions, setMarkedQuestions] = useState({});
  const [markingQuestionId, setMarkingQuestionId] = useState("");
  const [deleteState, setDeleteState] = useState({
    status: "idle",
    message: ""
  });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [retakeConfirmOpen, setRetakeConfirmOpen] = useState(false);
  useAutoDismissStatus(deleteState, setDeleteState);

  // Keeps text-generated material available to related study pages.
  useEffect(() => {
    if (!quizData?.document?.id) {
      return;
    }

    setActiveTextMaterialId(
      quizData.document.fileType === "text" ? quizData.document.id : ""
    );
  }, [quizData?.document?.id, quizData?.document?.fileType]);

  // Loads the current quiz for the selected document.
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

  // Loads questions already marked for Review Center.
  useEffect(() => {
    if (!quizData?.quiz) {
      setMarkedQuestions({});
      return;
    }

    if (getHashParams().get("retake") === "1") {
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

  // Restores saved results for review mode or resets state for retake mode.
  useEffect(() => {
    if (!quizData?.quiz?.id) {
      return;
    }

    const params = getHashParams();
    const savedResult = readQuizResult(quizData.quiz.id);

    if (params.get("review") === "1" && savedResult) {
      setAnswers(buildAnswersFromResult(savedResult));
      setAttemptResult({
        id: savedResult.attemptId || savedResult.completedAt,
        quizId: savedResult.quizId,
        score: savedResult.correctCount,
        totalQuestions: savedResult.totalQuestions,
        percentage: savedResult.scorePercentage,
        completedAt: savedResult.completedAt
      });
      return;
    }

    if (params.get("retake") === "1") {
      resetQuizAttempt({ clearMarked: true });
    }
  }, [quizData?.quiz?.id]);

  // Generates a fresh quiz from the selected study material.
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
      setAttemptStartedAt(Date.now());
      setStatus("success");
      window.location.hash = `#quizzes?documentId=${data.document.id}&quizId=${data.quiz.id}`;
    } catch (generateError) {
      setError(generateError.message || "Unable to generate quiz.");
      setStatus("error");
    } finally {
      setIsGenerating(false);
    }
  }

  // Sends selected answers to the backend and stores the result for review.
  async function handleSubmitAttempt() {
    if (!quizData?.quiz) {
      return;
    }

    const hasAnsweredQuestion = quizData.quiz.questions.some((_, index) => Number.isInteger(answers[index]));

    if (!hasAnsweredQuestion) {
      setError("Please answer at least one question before submitting.");
      return;
    }

    try {
      const orderedAnswers = quizData.quiz.questions.map((_, index) => (
        Number.isInteger(answers[index]) ? answers[index] : -1
      ));
      const response = await fetch(`/api/quizzes/${quizData.quiz.id}/attempt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: orderedAnswers,
          timeSpentMinutes: Math.round((Date.now() - attemptStartedAt) / 60000)
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not submit quiz attempt.");
      }

      setAttemptResult(data.attempt);
      const result = buildQuizResultPayload({
        quizData,
        answers,
        attempt: data.attempt,
        timeTakenSeconds: Math.max(0, Math.round((Date.now() - attemptStartedAt) / 1000))
      });
      saveQuizResult(result);
      window.dispatchEvent(new Event("studymind:dashboard-refresh"));
    } catch (submitError) {
      setError(submitError.message || "Could not submit quiz attempt.");
    }
  }

  // Clears answers and score state for a new attempt.
  function resetQuizAttempt({ clearMarked = false } = {}) {
    setAnswers({});
    setAttemptResult(null);
    setAttemptStartedAt(Date.now());

    if (clearMarked) {
      setMarkedQuestions({});
    }
  }

  // Adds or removes one quiz question from Review Center.
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

  // Deletes the current generated quiz without deleting the source material.
  async function handleDeleteQuiz() {
    if (!quizData?.quiz?.id) {
      return;
    }

    try {
      setDeleteState({ status: "loading", message: "Deleting quiz..." });
      const response = await fetch(`/api/quizzes/${quizData.quiz.id}`, {
        method: "DELETE"
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to delete quiz.");
      }

      setQuizData((current) => ({
        ...current,
        quiz: null,
        meta: {
          ...current.meta,
          hasQuiz: false,
          reused: false
        }
      }));
      setAnswers({});
      setAttemptResult(null);
      setMarkedQuestions({});
      setAttemptStartedAt(Date.now());
      setDeleteConfirmOpen(false);
      setDeleteState({ status: "success", message: data.message || "Quiz deleted successfully." });
      window.dispatchEvent(new Event("studymind:dashboard-refresh"));
    } catch (deleteError) {
      setDeleteConfirmOpen(false);
      setDeleteState({ status: "error", message: deleteError.message || "Unable to delete quiz." });
    }
  }

  // Calculates quiz completion state for submit and progress labels.
  const quiz = quizData?.quiz;
  const allAnswered = Boolean(quiz) && quiz.questions.every((_, index) => Number.isInteger(answers[index]));
  const questionCount = quiz?.questions?.length || 0;
  const answeredCount = quiz ? quiz.questions.filter((_, index) => Number.isInteger(answers[index])).length : 0;

  if (status === "loading") {
    return (
      <>
        <LoadingBanner
          title="Loading AI quiz"
          detail="Fetching generated questions and review state."
        />
        <QuizSkeleton />
      </>
    );
  }

  return (
    <div className="quiz-page">
      <header className="quiz-header">
        <div>
          <span className="summary-breadcrumb">Quizzes {quizData?.document?.title ? `> ${quizData.document.title}` : ""}</span>
          <h1>AI Quiz Generator</h1>
          <p>Practice with multiple-choice questions generated from your uploaded study material.</p>
        </div>
        <div className="generated-content-actions">
          <button
            className="summary-primary-action secondary"
            type="button"
            onClick={() => setRetakeConfirmOpen(true)}
            disabled={!quiz || isGenerating}
          >
            <RefreshCw size={17} />
            <span>Retake Quiz</span>
          </button>
          <LoadingButton
            className="summary-primary-action"
            isLoading={isGenerating}
            loadingLabel="Generating"
            onClick={handleGenerateQuiz}
            type="button"
          >
            <RefreshCw size={17} />
            <span>{quiz ? "Generate New Quiz" : "Generate Quiz"}</span>
          </LoadingButton>
          <button
            className="summary-primary-action danger"
            type="button"
            onClick={() => setDeleteConfirmOpen(true)}
            disabled={!quiz || deleteState.status === "loading"}
          >
            <Trash2 size={17} />
            <span>Delete Quiz</span>
          </button>
        </div>
      </header>

      {error && (
        <div className="quiz-alert">
          <strong>Quiz unavailable.</strong>
          <span>{error}</span>
        </div>
      )}

      {isGenerating && (
        <LoadingBanner
          title="Generating Quiz"
          detail="Creating questions from your study material."
        />
      )}

      {deleteState.status === "loading" && (
        <LoadingBanner
          title={deleteState.message || "Deleting quiz"}
          detail="Updating your quiz history."
          compact
        />
      )}
      {deleteState.status !== "idle" && deleteState.status !== "loading" && (
        <div className={`summary-export-status ${deleteState.status}`}>
          <span>{deleteState.message}</span>
        </div>
      )}

      {status === "success" && !quiz && !isGenerating && (
        <section className="quiz-empty-card">
          <Brain size={34} />
          <strong>No quiz generated yet.</strong>
          <p>Generate an AI quiz from the latest uploaded document or open a document from Summary first.</p>
          <LoadingButton
            onClick={handleGenerateQuiz}
            type="button"
          >
            Generate Quiz
          </LoadingButton>
        </section>
      )}

      {quiz && (
        <>
          <section className="quiz-meta-card">
            <div>
              <span>Source</span>
              <strong>{quizData.document.fileType === "text" ? "Pasted Text" : capitalize(quiz.source || "summary")}</strong>
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

          {attemptResult && (
            <section className="quiz-score-card" aria-label="Quiz score">
              <span>Score</span>
              <strong>{attemptResult.score}/{attemptResult.totalQuestions}</strong>
              <small>{attemptResult.percentage}%</small>
            </section>
          )}

          <section className="quiz-question-list">
            {quiz.questions.map((question, questionIndex) => (
              <article className="quiz-question-card" key={question.id || question.question}>
                <div className="quiz-question-top">
                  <span>Question {questionIndex + 1} of {questionCount}</span>
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
                        <strong>{option}</strong>
                        {showResult && isCorrect && <Check className="quiz-result-icon" size={18} aria-label="Correct answer" />}
                        {isWrongSelected && <X className="quiz-result-icon" size={18} aria-label="Selected wrong answer" />}
                      </button>
                    );
                  })}
                </div>
                {attemptResult && (
                  <div className="quiz-explanation">
                    <span>Explanation</span>
                    <p>{question.explanation}</p>
                  </div>
                )}
              </article>
            ))}
          </section>

          <div className="quiz-submit-row">
            <span className="quiz-submit-status">
              {attemptResult ? `Score ${attemptResult.percentage}% · ${attemptResult.score}/${attemptResult.totalQuestions} correct` : allAnswered ? "Ready to submit" : `${answeredCount}/${questionCount} answered`}
            </span>
            {attemptResult && (
              <>
                <a className="quiz-results-link primary" href={`#quiz-results?quizId=${quiz.id}`}>Review Results</a>
                <button className="quiz-results-link secondary" type="button" onClick={() => setRetakeConfirmOpen(true)}>Retake Quiz</button>
                <a className="quiz-results-link tertiary" href="#dashboard">Back to Dashboard</a>
              </>
            )}
            {!attemptResult && (
              <button type="button" onClick={handleSubmitAttempt}>
                Submit Quiz
              </button>
            )}
          </div>
        </>
      )}

      {retakeConfirmOpen && (
        <ConfirmationModal
          title="Retake Quiz?"
          message="Retake this quiz? Your current answers will be reset."
          confirmLabel="Retake"
          onCancel={() => setRetakeConfirmOpen(false)}
          onConfirm={() => {
            resetQuizAttempt({ clearMarked: true });
            setRetakeConfirmOpen(false);
          }}
        />
      )}

      {deleteConfirmOpen && (
        <ConfirmationModal
          title="Delete Quiz?"
          message={`This will permanently remove this quiz and its results. The original ${quizData?.document?.fileType === "text" ? "pasted text material" : "PDF"}, summary, and flashcards will remain unchanged.`}
          confirmLabel="Delete"
          isConfirming={deleteState.status === "loading"}
          onCancel={() => setDeleteConfirmOpen(false)}
          onConfirm={handleDeleteQuiz}
        />
      )}
    </div>
  );
}

// Shows a submitted quiz attempt with filters, explanations, and AI insight.
function QuizResultsPage() {
  const params = getHashParams();
  const quizId = params.get("quizId");
  const [filter, setFilter] = useState("all");
  const [expandedQuestions, setExpandedQuestions] = useState({});
  const [retakeConfirmOpen, setRetakeConfirmOpen] = useState(false);
  const [insight, setInsight] = useState("");
  const [insightStatus, setInsightStatus] = useState("idle");
  const result = quizId ? readQuizResult(quizId) : null;
  const displayedInsight = insightStatus === "fallback" ? QUIZ_INSIGHT_FALLBACK : insight;

  // Scrolls to the top when opening a new quiz result.
  useEffect(() => {
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }, [quizId]);

  // Resets local insight state when the result changes.
  useEffect(() => {
    setInsight(result?.aiInsightGenerated ? result.aiInsight || "" : "");
    setInsightStatus("idle");
  }, [result?.quizId]);

  // Generates the AI performance insight once per stored result.
  useEffect(() => {
    if (!result || result.aiInsightGenerated) {
      return undefined;
    }

    let isActive = true;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, 15000);

    async function generateInsight() {
      const payload = buildQuizInsightRequest(result);

      try {
        setInsightStatus("loading");
        console.info("Generating quiz AI insight", {
          quizId: result.quizId,
          scorePercentage: payload.scorePercentage,
          correctCount: payload.correctCount,
          incorrectCount: payload.incorrectCount,
          unansweredCount: payload.unansweredCount,
          answerCount: payload.answers.length
        });

        const response = await fetch(`/api/quizzes/${result.quizId}/insight`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.message || `Unable to generate AI performance insight (${response.status}).`);
        }

        const nextInsight = String(data.insight || "").trim();

        if (!nextInsight) {
          throw new Error("AI did not return an insight.");
        }

        if (!isActive) {
          return;
        }

        const updatedResult = { ...result, aiInsight: nextInsight, aiInsightGenerated: true };
        saveQuizResult(updatedResult);
        setInsight(nextInsight);
        setInsightStatus("ready");
      } catch (requestError) {
        if (!isActive) {
          return;
        }

        console.warn("Quiz AI insight generation failed", {
          quizId: result.quizId,
          timedOut: requestError.name === "AbortError",
          message: requestError.name === "AbortError"
            ? "AI insight generation timed out after 15 seconds."
            : requestError.message
        });
        setInsight("");
        setInsightStatus("fallback");
      } finally {
        window.clearTimeout(timeoutId);
      }
    }

    generateInsight();

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [result?.quizId]);

  if (!result) {
    return (
      <div className="quiz-page">
        <section className="quiz-empty-card">
          <Brain size={34} />
          <strong>Quiz results unavailable.</strong>
          <p>Submit a quiz to generate a detailed result report.</p>
          <a className="summary-primary-action" href="#quizzes">Back to Quiz</a>
        </section>
      </div>
    );
  }

  const filteredAnswers = result.answers.filter((answer) => filter === "all" || answer.status === filter);
  const scoreBand = getScoreBand(result.scorePercentage);

  // Expands or collapses one result explanation.
  function toggleQuestion(questionId) {
    setExpandedQuestions((current) => ({
      ...current,
      [questionId]: !current[questionId]
    }));
  }

  return (
    <div className="quiz-results-page">
      <header className="quiz-header quiz-results-header">
        <div>
          <div className="quiz-results-title">
            <Trophy size={28} aria-hidden="true" />
            <h1>Quiz Review</h1>
          </div>
          <p>Review your score, answers, and explanations.</p>
          <small>Completed {formatDateTime(result.completedAt)}</small>
        </div>
        <div className="generated-content-actions">
          <button className="quiz-action-link primary" type="button" onClick={() => setRetakeConfirmOpen(true)}>
            <RefreshCw size={17} />
            <span>Retake Quiz</span>
          </button>
          <a className="quiz-action-link secondary" href={`#quizzes?documentId=${result.documentId || ""}&review=1`}>
            Back to Quiz
          </a>
          <a className="quiz-action-link tertiary" href="#dashboard">Dashboard</a>
        </div>
      </header>

      <section className="quiz-results-summary">
        <div className={`quiz-results-score ${scoreBand}`}>
          <small>{result.scorePercentage}%</small>
          <strong>{result.correctCount} / {result.totalQuestions}</strong>
        </div>
        <div className="quiz-stat-card correct">
          <span>Correct</span>
          <strong>{result.correctCount}</strong>
        </div>
        <div className="quiz-stat-card incorrect">
          <span>Incorrect</span>
          <strong>{result.incorrectCount}</strong>
        </div>
        <div className="quiz-stat-card unanswered">
          <span>Unanswered</span>
          <strong>{result.unansweredCount}</strong>
        </div>
        <div className="quiz-stat-card total">
          <span>Total</span>
          <strong>{result.totalQuestions}</strong>
        </div>
        <div className="quiz-stat-card time">
          <span>Time Taken</span>
          <strong>{formatDuration(result.timeTakenSeconds)}</strong>
        </div>
      </section>

      <section className="quiz-results-grid">
        <article className="quiz-result-card insight">
          <span className="summary-section-label">AI Performance Insight</span>
          <h2>AI Performance Insight</h2>
          {displayedInsight && <p>{displayedInsight}</p>}
          {insightStatus === "loading" && (
            <LoadingBanner
              compact
              title="Generating performance insight"
              detail="Reviewing your answers and identifying next steps."
            />
          )}
        </article>
      </section>

      <section className="quiz-review-card">
        <div className="summary-card-heading">
          <div>
            <span className="summary-section-label">Question Review</span>
            <h2>Question Review</h2>
          </div>
          <div className="summary-segmented" aria-label="Question review filter">
            {[
              ["all", "All"],
              ["correct", "Correct"],
              ["incorrect", "Incorrect"],
              ["unanswered", "Unanswered"]
            ].map(([value, label]) => (
              <button className={filter === value ? "active" : ""} key={value} type="button" onClick={() => setFilter(value)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="quiz-review-list">
          {filteredAnswers.map((answer) => {
            const expanded = expandedQuestions[answer.questionId];

            return (
              <article className={`quiz-review-item ${answer.status}`} key={answer.questionId}>
                <button type="button" onClick={() => toggleQuestion(answer.questionId)}>
                  <div>
                    <strong>Question {answer.questionNumber}</strong>
                    <p>{answer.questionText}</p>
                    <span className={`quiz-status-badge ${answer.status}`}>{capitalize(answer.status)}</span>
                  </div>
                  <ChevronDown size={18} />
                </button>
                {expanded && (
                  <div className="quiz-review-detail">
                    <div>
                      <span>Your Answer</span>
                      <strong className={answer.status === "incorrect" ? "wrong" : ""}>
                        {answer.selectedAnswerText || "Not answered"}
                      </strong>
                    </div>
                    <div>
                      <span>Correct Answer</span>
                      <strong className="right">{answer.correctAnswerText}</strong>
                    </div>
                    <p>{answer.explanation}</p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="quiz-recommended-actions">
        <h2>Recommended Action</h2>
        <div>
          <a className="summary-primary-action secondary" href="#review?tab=questions">Go to Marked Review Center</a>
          <a className="summary-primary-action" href={`#summary?documentId=${result.documentId || ""}`}>Open AI Tutor</a>
        </div>
      </section>

      {retakeConfirmOpen && (
        <ConfirmationModal
          title="Retake Quiz?"
          message="Retake this quiz? Your current answers will be reset."
          confirmLabel="Retake"
          onCancel={() => setRetakeConfirmOpen(false)}
          onConfirm={() => {
            setRetakeConfirmOpen(false);
            window.location.hash = `#quizzes?documentId=${result.documentId || ""}&quizId=${result.quizId}&retake=1`;
          }}
        />
      )}
    </div>
  );
}

// Loads flashcard decks and handles simple revision deck actions.
function FlashcardsPage() {
  const params = getHashParams();
  const documentId = params.get("documentId");
  const setId = params.get("setId");
  const [deckData, setDeckData] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [deleteState, setDeleteState] = useState({
    status: "idle",
    message: ""
  });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  useAutoDismissStatus(deleteState, setDeleteState);

  // Keeps text-generated material available to related study pages.
  useEffect(() => {
    if (!deckData?.document?.id) {
      return;
    }

    setActiveTextMaterialId(
      deckData.document.fileType === "text" ? deckData.document.id : ""
    );
  }, [deckData?.document?.id, deckData?.document?.fileType]);

  // Loads an existing deck for the selected document or set.
  useEffect(() => {
    const controller = new AbortController();

    async function loadFlashcards() {
      try {
        setStatus("loading");
        setError("");
        const queryParams = new URLSearchParams();

        if (documentId) {
          queryParams.set("documentId", documentId);
        }

        if (setId) {
          queryParams.set("setId", setId);
        }

        const query = queryParams.size ? `?${queryParams.toString()}` : "";
        const response = await fetch(`/api/flashcards${query}`, {
          cache: "no-store",
          signal: controller.signal
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || `Flashcards request failed with ${response.status}`);
        }

        setDeckData(data);
        setCurrentIndex(0);
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
  }, [documentId, setId]);

  // Generates a new flashcard deck from the current document selection.
  async function handleGenerateFlashcards() {
    if (isGenerating) {
      return;
    }

    try {
      setIsGenerating(true);
      setError("");
      const currentDeck = deckData?.flashcardSet;
      const selectedDocumentIds = currentDeck?.generationType === "selected"
        ? currentDeck.selectedDocumentIds
        : undefined;
      const response = await fetch("/api/flashcards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          documentId: deckData?.document?.id || documentId,
          documentIds: selectedDocumentIds,
          folderId: selectedDocumentIds?.length ? currentDeck.folderId : undefined,
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
      window.dispatchEvent(new Event("studymind:dashboard-refresh"));
    } catch (generateError) {
      setError(generateError.message || "Unable to generate flashcards.");
      setStatus("error");
    } finally {
      setIsGenerating(false);
    }
  }

  // Moves between cards in a circular revision loop.
  function goToCard(nextIndex) {
    const count = deckData?.flashcardSet?.cards?.length || 0;

    if (!count) {
      return;
    }

    const safeIndex = ((nextIndex % count) + count) % count;
    setCurrentIndex(safeIndex);
    setIsFlipped(false);
  }

  // Deletes the current flashcard deck without deleting the source material.
  async function handleDeleteFlashcards() {
    if (!deckData?.flashcardSet?.id) {
      return;
    }

    try {
      setDeleteState({ status: "loading", message: "Deleting flashcards..." });
      const response = await fetch(`/api/flashcards/${deckData.flashcardSet.id}`, {
        method: "DELETE"
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to delete flashcards.");
      }

      setDeckData((current) => ({
        ...current,
        flashcardSet: null,
        meta: {
          ...current.meta,
          hasFlashcards: false,
          reused: false
        }
      }));
      setCurrentIndex(0);
      setIsFlipped(false);
      setDeleteConfirmOpen(false);
      setDeleteState({ status: "success", message: data.message || "Flashcards deleted successfully." });
      window.dispatchEvent(new Event("studymind:dashboard-refresh"));
    } catch (deleteError) {
      setDeleteConfirmOpen(false);
      setDeleteState({ status: "error", message: deleteError.message || "Unable to delete flashcards." });
    }
  }

  // Calculates visible flashcard position for the revision deck.
  const deck = deckData?.flashcardSet;
  const cards = deck?.cards || [];
  const currentCard = cards[currentIndex];
  const displayedProgressIndex = Math.min(currentIndex + 1, cards.length);
  const progressPercent = cards.length ? Math.round((displayedProgressIndex / cards.length) * 100) : 0;

  if (status === "loading") {
    return (
      <>
        <LoadingBanner
          title="Loading AI flashcards"
          detail="Fetching your revision deck."
        />
        <FlashcardsSkeleton />
      </>
    );
  }

  return (
    <div className="flashcards-page">
      <header className="flashcards-header">
        <div>
          <span className="summary-breadcrumb">Flashcards {deckData?.document?.title ? `> ${deckData.document.title}` : ""}</span>
          <h1>AI Flashcards</h1>
          <p>Flip through concise revision cards generated from your uploaded study material.</p>
        </div>
        <div className="generated-content-actions">
          <button
            className="flashcard-guide-button"
            type="button"
            aria-label="Open Quick Guide for AI Flashcards"
            onClick={() => setGuideOpen(true)}
          >
            <BookOpen size={17} />
            <span>Quick Guide</span>
          </button>
          <LoadingButton
            className="summary-primary-action"
            isLoading={isGenerating}
            loadingLabel="Generating"
            onClick={handleGenerateFlashcards}
            type="button"
          >
            <RefreshCw size={17} />
            <span>{deck ? "Generate New Deck" : "Generate Flashcards"}</span>
          </LoadingButton>
          <button
            className="summary-primary-action danger"
            type="button"
            onClick={() => setDeleteConfirmOpen(true)}
            disabled={!deck || deleteState.status === "loading"}
          >
            <Trash2 size={17} />
            <span>Delete Flashcards</span>
          </button>
        </div>
      </header>

      {error && (
        <div className="quiz-alert">
          <strong>Flashcards unavailable.</strong>
          <span>{error}</span>
        </div>
      )}

      {isGenerating && (
        <LoadingBanner
          title="Generating Flashcards"
          detail="Extracting key concepts for revision."
        />
      )}

      {deleteState.status === "loading" && (
        <LoadingBanner
          title={deleteState.message || "Deleting flashcards"}
          detail="Updating your saved study materials."
          compact
        />
      )}
      {deleteState.status !== "idle" && deleteState.status !== "loading" && (
        <div className={`summary-export-status ${deleteState.status}`}>
          <span>{deleteState.message}</span>
        </div>
      )}

      {status === "success" && !deck && !isGenerating && (
        <section className="flashcards-empty-card">
          <BookOpen size={36} />
          <strong>No flashcards generated yet.</strong>
          <p>Generate AI flashcards from your latest uploaded document or open a document from Summary first.</p>
          <LoadingButton
            onClick={handleGenerateFlashcards}
            type="button"
          >
            Generate Flashcards
          </LoadingButton>
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
              <strong>{`Card ${currentIndex + 1} of ${cards.length}`}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>Revision Deck</strong>
            </div>
          </section>

          <section className="flashcard-study-area">
            <button
              aria-label="Previous card"
              className="flash-nav-button previous"
              type="button"
              onClick={() => goToCard(currentIndex - 1)}
              disabled={isGenerating}
            >
              <ChevronLeft aria-hidden="true" size={24} strokeWidth={2.4} />
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

            <button
              aria-label="Next card"
              className="flash-nav-button next"
              type="button"
              onClick={() => goToCard(currentIndex + 1)}
              disabled={isGenerating}
            >
              <ChevronRight aria-hidden="true" size={24} strokeWidth={2.4} />
            </button>
          </section>

          <section className="flashcard-controls">
            <div className="flash-progress">
              <span style={{ width: `${progressPercent}%` }} />
            </div>
          </section>
        </>
      )}

      {deleteConfirmOpen && (
        <ConfirmationModal
          title="Delete Flashcards?"
          message={`This will permanently remove the generated flashcards. The original ${deckData?.document?.fileType === "text" ? "pasted text material" : "PDF"} and summary will remain unchanged.`}
          confirmLabel="Delete"
          isConfirming={deleteState.status === "loading"}
          onCancel={() => setDeleteConfirmOpen(false)}
          onConfirm={handleDeleteFlashcards}
        />
      )}
      {guideOpen && <FlashcardGuideModal onClose={() => setGuideOpen(false)} />}
    </div>
  );
}

// Flashcard help modal that explains the revision controls.
function FlashcardGuideModal({ onClose }) {
  // Lets Escape close the flashcard guide.
  useEffect(() => {
    function handleKeydown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [onClose]);

  const guideItems = [
    {
      title: "Tap for Answer",
      text: "Tap anywhere on the card to know the answer."
    },
    {
      title: "Next and Previous",
      text: "Use the arrows to move through the deck at your own pace."
    },
    {
      title: "Loop the Deck",
      text: "Next from the last card returns to the first card, and Previous from the first card returns to the last card."
    },
    {
      title: "Revise Freely",
      text: "Keep cycling through cards until the concepts feel clear."
    }
  ];

  return (
    <div
      className="flashcard-guide-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="flashcard-guide-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="flashcard-guide-title"
      >
        <button className="flashcard-guide-close" type="button" aria-label="Close Quick Guide" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="flashcard-guide-heading">
          <span>Quick Guide</span>
          <h2 id="flashcard-guide-title">How Flashcards Work</h2>
        </div>
        <div className="flashcard-guide-list">
          {guideItems.map((item) => (
            <div className="flashcard-guide-item" key={item.title}>
              <strong>{item.title}</strong>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
        <div className="flashcard-guide-actions">
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </section>
    </div>
  );
}
