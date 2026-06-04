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
  Check,
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
  LogOut,
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
  Trophy,
  Upload,
  UserCircle,
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
  { key: "documentsUploaded", label: "PDFs in Library", icon: LibraryBig },
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

const TOAST_DISMISS_MS = 5000;

function App() {
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

  useEffect(() => {
    if (auth.status !== "authenticated" || page !== "dashboard") {
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

  async function handleAuthenticated(userData) {
    setDashboard(null);
    setAuth({ status: "authenticated", user: userData });
    window.location.hash = "#dashboard";
  }

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
          <span>Restoring your session...</span>
        </div>
      </div>
    );
  }

  if (auth.status !== "authenticated") {
    return <AuthPage onAuthenticated={handleAuthenticated} />;
  }

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <Sidebar
        user={user}
        activePage={page}
        collapsed={sidebarCollapsed}
        onLogout={handleLogout}
        onToggle={() => setSidebarCollapsed((value) => !value)}
      />
      <main className={`dashboard-main ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        {page === "summary" ? (
          <SummaryPage />
        ) : page === "library" ? (
          <LibraryPage />
        ) : page === "quizzes" ? (
          <QuizPage />
        ) : page === "quiz-results" ? (
          <QuizResultsPage />
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

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function useStudyActivityTracker(page, enabled = true) {
  const [liveSeconds, setLiveSeconds] = useState(0);
  const lastActivityRef = useRef(Date.now());
  const lastTickRef = useRef(Date.now());
  const pendingSecondsRef = useRef(0);
  const sourceRef = useRef(page || "dashboard");

  useEffect(() => {
    sourceRef.current = page || "dashboard";
  }, [page]);

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

function useAutoDismissMessage(message, setMessage, duration = TOAST_DISMISS_MS) {
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

function useAutoDismissStatus(state, setState, duration = TOAST_DISMISS_MS) {
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

function Sidebar({ user, activePage, collapsed, onLogout, onToggle }) {
  const [menuOpen, setMenuOpen] = useState(false);
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

      <div className="profile-area">
        <button
          className="profile-card"
          data-tooltip={`${user.name} - ${user.email}`}
          type="button"
          onClick={() => setMenuOpen((value) => !value)}
          aria-expanded={menuOpen}
        >
          <div className="avatar">{initials}</div>
          <div>
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
        </button>
        {menuOpen && (
          <div className="profile-menu">
            <div>
              <UserCircle size={17} />
              <span>Profile</span>
            </div>
            <button type="button" onClick={onLogout}>
              <LogOut size={17} />
              <span>Logout</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

function AuthPage({ onAuthenticated }) {
  const [mode, setMode] = useState("login");

  return (
    <div className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark">
            <GraduationCap size={24} />
          </div>
          <div>
            <strong>StudyMind AI</strong>
            <span>AI study workspace</span>
          </div>
        </div>
        {mode === "login" ? (
          <LoginForm
            onAuthenticated={onAuthenticated}
            onCreateAccount={() => setMode("signup")}
          />
        ) : (
          <SignupForm
            onAuthenticated={onAuthenticated}
            onLogin={() => setMode("login")}
          />
        )}
      </section>
    </div>
  );
}

function LoginForm({ onAuthenticated, onCreateAccount }) {
  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = {};

    if (!form.email.trim()) {
      nextErrors.email = "Email is required.";
    }

    if (!form.password) {
      nextErrors.password = "Password is required.";
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length) {
      return;
    }

    try {
      setStatus("loading");
      setMessage("");
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Invalid email or password.");
      }

      onAuthenticated(data.user);
    } catch (loginError) {
      setMessage(loginError.message || "Invalid email or password.");
      setStatus("error");
    } finally {
      setStatus((current) => current === "loading" ? "idle" : current);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="auth-copy">
        <span>Welcome back</span>
        <h1>Login to your account</h1>
        <p>Continue with your folders, PDFs, quizzes, and flashcards.</p>
      </div>

      {message && <div className="auth-message error">{message}</div>}

      <AuthField
        error={errors.email}
        label="Email Address"
        name="email"
        onChange={setForm}
        type="email"
        value={form.email}
      />
      <AuthField
        error={errors.password}
        label="Password"
        name="password"
        onChange={setForm}
        type="password"
        value={form.password}
      />

      <button className="auth-primary-button" type="submit" disabled={status === "loading"}>
        {status === "loading" ? "Logging in..." : "Login"}
      </button>
      <button className="auth-secondary-button" type="button" onClick={onCreateAccount}>
        Create Account
      </button>
    </form>
  );
}

function SignupForm({ onAuthenticated, onLogin }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: ""
  });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = {};

    if (!form.name.trim()) {
      nextErrors.name = "Name is required.";
    }

    if (!isValidEmail(form.email)) {
      nextErrors.email = "Valid email is required.";
    }

    if (form.password.length < 8) {
      nextErrors.password = "Password must be at least 8 characters.";
    }

    if (form.password !== form.confirmPassword) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length) {
      return;
    }

    try {
      setStatus("loading");
      setMessage("");
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to create account.");
      }

      onAuthenticated(data.user);
    } catch (signupError) {
      setMessage(signupError.message || "Unable to create account.");
      setStatus("error");
    } finally {
      setStatus((current) => current === "loading" ? "idle" : current);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="auth-copy">
        <span>Create account</span>
        <h1>Start studying privately</h1>
        <p>Your study material, progress, and AI history stay attached only to your account.</p>
      </div>

      {message && <div className="auth-message error">{message}</div>}

      <AuthField
        error={errors.name}
        label="Full Name"
        name="name"
        onChange={setForm}
        value={form.name}
      />
      <AuthField
        error={errors.email}
        label="Email Address"
        name="email"
        onChange={setForm}
        type="email"
        value={form.email}
      />
      <AuthField
        error={errors.password}
        label="Password"
        name="password"
        onChange={setForm}
        type="password"
        value={form.password}
      />
      <AuthField
        error={errors.confirmPassword}
        label="Confirm Password"
        name="confirmPassword"
        onChange={setForm}
        type="password"
        value={form.confirmPassword}
      />

      <button className="auth-primary-button" type="submit" disabled={status === "loading"}>
        {status === "loading" ? "Creating account..." : "Create Account"}
      </button>
      <button className="auth-secondary-button" type="button" onClick={onLogin}>
        Login
      </button>
    </form>
  );
}

function AuthField({ error, label, name, onChange, type = "text", value }) {
  return (
    <label className="auth-field">
      <span>{label}</span>
      <input
        aria-invalid={Boolean(error)}
        name={name}
        type={type}
        value={value}
        onChange={(event) => onChange((current) => ({
          ...current,
          [name]: event.target.value
        }))}
      />
      {error && <small>{error}</small>}
    </label>
  );
}

function Header({ user, uploadState, setUploadState }) {
  const firstName = user.name.split(" ")[0] || "Alex";
  const fileInputRef = useRef(null);
  useAutoDismissStatus(uploadState, setUploadState);

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
  useAutoDismissMessage(message, setMessage);

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
      window.dispatchEvent(new Event("studymind:dashboard-refresh"));
      await Promise.all([loadFolders(), openFolder(selectedFolder)]);
    } catch (requestError) {
      setMessage({ type: "error", text: requestError.message || "Unable to move PDFs." });
    }
  }

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
          onRenameDocument={renameDocument}
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
  onRenameDocument,
  onSelectDocuments,
  onSetMoveTarget,
  onUploadFiles,
  onViewPdf,
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

  function handleRowClick(event, id) {
    if (event.target.closest("a, button, input, select")) {
      return;
    }

    toggleDocument(id);
  }

  function handleRowKeyDown(event, id) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleDocument(id);
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    onUploadFiles(event.dataTransfer.files);
  }

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

function ReviewPage() {
  const [summaryGroups, setSummaryGroups] = useState([]);
  const [questionGroups, setQuestionGroups] = useState([]);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState({ type: "idle", text: "" });
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [activeTab, setActiveTab] = useState("summaries");
  useAutoDismissMessage(message, setMessage);

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
        </div>
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
  const documentId = document.documentId || document.id;
  const pdfUrl = document.pdfUrl || (documentId ? `/api/documents/${documentId}/pdf` : "");
  const downloadUrl = pdfUrl ? `${pdfUrl}?download=1` : "#";

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
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatStatus, setChatStatus] = useState("idle");
  const [chatError, setChatError] = useState("");
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const chatRef = useRef(null);
  const chatScrollPositions = useRef({ compact: 0, expanded: 0 });
  useAutoDismissStatus(quizGeneration, setQuizGeneration);
  useAutoDismissStatus(flashcardGeneration, setFlashcardGeneration);
  useAutoDismissStatus(pdfExportState, setPdfExportState);
  useAutoDismissStatus(deleteState, setDeleteState);
  useAutoDismissStatus(saveSummaryState, setSaveSummaryState);

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
        questions: [],
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
        <div className="summary-header-main">
          <span className="summary-breadcrumb">Library &gt; {document.title}</span>
          <h1>{document.title}</h1>
          <div className="summary-meta">
            <span>{formatFileType(document.fileType)} Document</span>
            <span>{document.pageCount || 23} Pages</span>
            <span>Uploaded on {uploadedDate}</span>
          </div>
          <div className="summary-status-row">
            <span className="status-chip">{summary?.status || "No Summary Yet"}</span>
            <span className="updated-chip">{updatedLabel}</span>
          </div>
        </div>

        <div className="summary-header-actions">
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

      {deleteState.status !== "idle" && (
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
          <div className={`summary-scroll-panel ${length === "detailed" ? "collapsed" : ""}`}>
            <SummarySections text={summary.content?.[length] || summary.displayedContent} length={length} />
          </div>
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

      {deleteConfirmOpen && (
        <ConfirmationModal
          title="Delete Summary?"
          message="This will permanently remove the generated summary. The original PDF will remain unchanged."
          confirmLabel="Delete"
          isConfirming={deleteState.status === "loading"}
          onCancel={() => setDeleteConfirmOpen(false)}
          onConfirm={handleDeleteSummary}
        />
      )}
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

function ConfirmationModal({
  confirmLabel = "Delete",
  isConfirming = false,
  message,
  onCancel,
  onConfirm,
  title
}) {
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
          <span className="summary-section-label">Confirm Delete</span>
          <h2 id="confirmation-title">{title}</h2>
          <p>{message}</p>
        </div>
        <div className="confirmation-actions">
          <button type="button" onClick={onCancel} disabled={isConfirming}>
            Cancel
          </button>
          <button className="danger" type="button" onClick={onConfirm} disabled={isConfirming}>
            {isConfirming ? "Deleting" : confirmLabel}
          </button>
        </div>
      </section>
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

  async function handleSubmitAttempt() {
    if (!quizData?.quiz) {
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

  function resetQuizAttempt({ clearMarked = false } = {}) {
    setAnswers({});
    setAttemptResult(null);
    setAttemptStartedAt(Date.now());

    if (clearMarked) {
      setMarkedQuestions({});
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

  const quiz = quizData?.quiz;
  const allAnswered = Boolean(quiz) && quiz.questions.every((_, index) => Number.isInteger(answers[index]));
  const questionCount = quiz?.questions?.length || 0;
  const answeredCount = quiz ? quiz.questions.filter((_, index) => Number.isInteger(answers[index])).length : 0;

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
        <div className="generated-content-actions">
          <button
            className="summary-primary-action secondary"
            type="button"
            onClick={() => setRetakeConfirmOpen(true)}
            disabled={!quiz}
          >
            <RefreshCw size={17} />
            <span>Retake Quiz</span>
          </button>
          <button className="summary-primary-action" type="button" onClick={handleGenerateQuiz} disabled={isGenerating}>
            <RefreshCw size={17} />
            <span>{isGenerating ? "Generating" : quiz ? "Generate New Quiz" : "Generate Quiz"}</span>
          </button>
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

      {deleteState.status !== "idle" && (
        <div className={`summary-export-status ${deleteState.status}`}>
          <span>{deleteState.message}</span>
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
          message="This will permanently remove this quiz and its results. The original PDF, summary, and flashcards will remain unchanged."
          confirmLabel="Delete"
          isConfirming={deleteState.status === "loading"}
          onCancel={() => setDeleteConfirmOpen(false)}
          onConfirm={handleDeleteQuiz}
        />
      )}
    </div>
  );
}

function QuizResultsPage() {
  const params = getHashParams();
  const quizId = params.get("quizId");
  const [filter, setFilter] = useState("all");
  const [expandedQuestions, setExpandedQuestions] = useState({});
  const [retakeConfirmOpen, setRetakeConfirmOpen] = useState(false);
  const [insight, setInsight] = useState("");
  const [insightStatus, setInsightStatus] = useState("idle");
  const result = quizId ? readQuizResult(quizId) : null;

  useEffect(() => {
    setInsight(result?.aiInsight || "");
    setInsightStatus("idle");
  }, [result?.quizId]);

  useEffect(() => {
    if (!result || result.aiInsightGenerated || insightStatus !== "idle") {
      return undefined;
    }

    let isActive = true;
    setInsightStatus("loading");

    fetch(`/api/quizzes/${result.quizId}/insight`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildQuizInsightRequest(result))
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.message || "Unable to generate AI performance insight.");
        }

        return data;
      })
      .then((data) => {
        if (!isActive || !data.insight) {
          return;
        }

        const updatedResult = { ...result, aiInsight: data.insight, aiInsightGenerated: true };
        saveQuizResult(updatedResult);
        setInsight(data.insight);
        setInsightStatus("ready");
      })
      .catch(() => {
        if (isActive) {
          setInsightStatus("fallback");
        }
      });

    return () => {
      isActive = false;
    };
  }, [result?.quizId, insightStatus]);

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
          <span className="summary-breadcrumb">Quiz Results</span>
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
          <span>Score</span>
          <small>{result.scorePercentage}%</small>
          <strong>{result.correctCount} / {result.totalQuestions}</strong>
          <em>{getScoreLabel(result.scorePercentage)}</em>
          <p>{getScoreMessage(result.scorePercentage)}</p>
        </div>
        <div className="quiz-stat-card correct">
          <span className="quiz-stat-icon">✓</span>
          <span>Correct</span>
          <strong>{result.correctCount}</strong>
        </div>
        <div className="quiz-stat-card incorrect">
          <span className="quiz-stat-icon">×</span>
          <span>Incorrect</span>
          <strong>{result.incorrectCount}</strong>
        </div>
        <div className="quiz-stat-card unanswered">
          <span className="quiz-stat-icon">–</span>
          <span>Unanswered</span>
          <strong>{result.unansweredCount}</strong>
        </div>
        <div className="quiz-stat-card total">
          <span className="quiz-stat-icon">#</span>
          <span>Total</span>
          <strong>{result.totalQuestions}</strong>
        </div>
        <div className="quiz-stat-card time">
          <span className="quiz-stat-icon">⌁</span>
          <span>Time Taken</span>
          <strong>{formatDuration(result.timeTakenSeconds)}</strong>
        </div>
      </section>

      <section className="quiz-results-grid">
        <article className="quiz-result-card insight">
          <span className="summary-section-label">AI Performance Insight</span>
          <h2>AI Performance Insight</h2>
          <p>{insight || result.aiInsight}</p>
          {insightStatus === "loading" && <small>Generating a personalized insight from your answers...</small>}
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
          <a className="summary-primary-action secondary" href={`#quizzes?documentId=${result.documentId || ""}&review=1`}>Review Incorrect Questions</a>
          <a className="summary-primary-action" href={`#summary?documentId=${result.documentId || ""}`}>Open AI Tutor</a>
          <button className="summary-primary-action secondary" type="button" onClick={() => setRetakeConfirmOpen(true)}>Retake Quiz</button>
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
  const [deleteState, setDeleteState] = useState({
    status: "idle",
    message: ""
  });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  useAutoDismissStatus(deleteState, setDeleteState);

  useEffect(() => {
    if (savingState !== "saved") {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setSavingState((current) => (current === "saved" ? "idle" : current));
    }, TOAST_DISMISS_MS);

    return () => window.clearTimeout(timeoutId);
  }, [savingState]);

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
        progress: null,
        meta: {
          ...current.meta,
          hasFlashcards: false,
          reused: false
        }
      }));
      setCurrentIndex(0);
      setIsFlipped(false);
      setSavingState("idle");
      setDeleteConfirmOpen(false);
      setDeleteState({ status: "success", message: data.message || "Flashcards deleted successfully." });
      window.dispatchEvent(new Event("studymind:dashboard-refresh"));
    } catch (deleteError) {
      setDeleteConfirmOpen(false);
      setDeleteState({ status: "error", message: deleteError.message || "Unable to delete flashcards." });
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
        <div className="generated-content-actions">
          <button className="summary-primary-action" type="button" onClick={handleGenerateFlashcards} disabled={isGenerating}>
            <RefreshCw size={17} />
            <span>{isGenerating ? "Generating" : deck ? "Generate New Deck" : "Generate Flashcards"}</span>
          </button>
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

      {deleteState.status !== "idle" && (
        <div className={`summary-export-status ${deleteState.status}`}>
          <span>{deleteState.message}</span>
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

      {deleteConfirmOpen && (
        <ConfirmationModal
          title="Delete Flashcards?"
          message="This will permanently remove the generated flashcards. The original PDF and summary will remain unchanged."
          confirmLabel="Delete"
          isConfirming={deleteState.status === "loading"}
          onCancel={() => setDeleteConfirmOpen(false)}
          onConfirm={handleDeleteFlashcards}
        />
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
  const trendDisplay = getTrendDisplay(trend);

  return (
    <article className="stat-card">
      <div className="stat-icon">
        <Icon size={22} />
      </div>
      <div>
        <strong>{displayValue}</strong>
        <span>{label}</span>
        {trendDisplay && (
          <small className={`stat-trend ${trendDisplay.className}`}>
            {trendDisplay.icon ? `${trendDisplay.icon} ` : ""}
            {trendDisplay.label}
          </small>
        )}
      </div>
    </article>
  );
}

function getTrendDisplay(trend) {
  if (!trend) {
    return null;
  }

  const value = Number(trend.value);
  const direction = String(trend.direction || "").toLowerCase();

  if (direction === "flat" || direction === "same" || value === 0) {
    return {
      className: "neutral",
      icon: "",
      label: "Same as last week"
    };
  }

  if (direction === "down" || value < 0) {
    return {
      className: "negative",
      icon: "↓",
      label: trend.label || `${Math.abs(value)}% from last week`
    };
  }

  return {
    className: "positive",
    icon: "↑",
    label: trend.label || `+${value}% from last week`
  };
}

function DailyGoalWidget({ goal, liveStudySeconds }) {
  const [goalState, setGoalState] = useState(() => normalizeGoal(goal));
  const [saveStatus, setSaveStatus] = useState("idle");
  const [saveError, setSaveError] = useState("");
  const studyOptions = [
    { label: "30 minutes", value: 30 },
    ...Array.from({ length: 12 }, (_, index) => ({
      label: index === 0 ? "1 hour" : `${index + 1} hours`,
      value: (index + 1) * 60
    }))
  ];
  const quizOptions = Array.from({ length: 20 }, (_, index) => ({
    label: `${index + 1} ${index === 0 ? "Quiz" : "Quizzes"}`,
    value: index + 1
  }));
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
    <section className={`daily-goal-card ${goalComplete ? "complete" : ""}`} id="daily-goal">
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
          <GoalDropdown
            label="Study time goal"
            options={studyOptions}
            onChange={(value) => saveGoal({ targetMinutes: value })}
            value={goalState.targetMinutes}
          />
        ) : (
          <GoalDropdown
            label="Quiz goal"
            options={quizOptions}
            onChange={(value) => saveGoal({ targetQuizzes: value })}
            value={goalState.targetQuizzes}
          />
        )}
      </div>
      <div className="daily-goal-progress">
        <span style={{ width: `${progressPercent}%` }} />
      </div>
    </section>
  );
}

function GoalDropdown({ className = "", disabled = false, label, options, placeholder = "", value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const selectedOption = options.find((option) => option.value === value) || null;
  const triggerLabel = selectedOption?.label || placeholder || options[0]?.label || "Select";

  useEffect(() => {
    function handlePointerDown(event) {
      if (!dropdownRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  function handleSelect(option) {
    if (disabled) {
      return;
    }

    onChange(option.value);
    setIsOpen(false);
  }

  return (
    <div className={`goal-dropdown ${className}`} ref={dropdownRef}>
      <button
        className="goal-dropdown-trigger"
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>{triggerLabel}</span>
        <ChevronDown size={16} />
      </button>
      {isOpen && !disabled && (
        <div className="goal-dropdown-menu" role="listbox" aria-label={label}>
          {options.map((option) => {
            const selected = option.value === selectedOption?.value;

            return (
              <button
                className={selected ? "selected" : ""}
                key={option.value}
                role="option"
                aria-selected={selected}
                type="button"
                onClick={() => handleSelect(option)}
              >
                <span>{option.label}</span>
                {selected && <strong aria-hidden="true">✓</strong>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MoveFolderDropdown({ disabled = false, label, onChange, options, placeholder, value }) {
  return (
    <GoalDropdown
      className="move-folder-dropdown"
      disabled={disabled}
      label={label}
      onChange={onChange}
      options={options.map((option) => ({ label: option.name, value: option.id }))}
      placeholder={placeholder}
      value={value}
    />
  );
}

function normalizeGoal(goal) {
  return {
    type: goal?.type === "quiz" ? "quiz" : "studyTime",
    targetMinutes: clamp(goal?.targetMinutes, 30, 12 * 60, 60),
    targetQuizzes: clamp(goal?.targetQuizzes, 1, 20, 3),
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
        <GoalDropdown
          className="progress-range-dropdown"
          label="Study progress range"
          onChange={setPeriod}
          options={[
            { value: "week", label: "This Week" },
            { value: "month", label: "This Month" }
          ]}
          value={period}
        />
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
            <text className="primary-axis-label" key={label.y} x={label.x} y={label.y}>{label.text}</text>
          ))}
          {chart.xLabels.map((label) => (
            <text className="secondary-axis-label" key={label.x} x={label.x} y="326">{label.text}</text>
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
  const path = buildSmoothPath(points);
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

function buildSmoothPath(points) {
  if (!points.length) {
    return "";
  }

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  return points.reduce((path, point, index) => {
    if (index === 0) {
      return `M ${point.x} ${point.y}`;
    }

    const previousPoint = points[index - 1];
    const controlOffset = Math.max(24, (point.x - previousPoint.x) * 0.45);
    const controlOneX = previousPoint.x + controlOffset;
    const controlTwoX = point.x - controlOffset;

    return `${path} C ${controlOneX} ${previousPoint.y}, ${controlTwoX} ${point.y}, ${point.x} ${point.y}`;
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
  function handleInsightClick(event, insight) {
    if (insight.action !== "dailyGoal") {
      return;
    }

    event.preventDefault();
    document.getElementById("daily-goal")?.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }

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
              <a
                className="insight-card"
                href={insight.href || "#summary"}
                key={insight.title}
                onClick={(event) => handleInsightClick(event, insight)}
              >
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
  const [visibleItems, setVisibleItems] = useState(items.slice(0, 3));
  const [pendingRemoveItem, setPendingRemoveItem] = useState(null);
  const [removeState, setRemoveState] = useState({
    status: "idle",
    message: ""
  });
  useAutoDismissStatus(removeState, setRemoveState);

  useEffect(() => {
    setVisibleItems(items.slice(0, 3));
  }, [items]);

  async function handleRemoveItem() {
    if (!pendingRemoveItem?.subject) {
      return;
    }

    try {
      setRemoveState({ status: "loading", message: "Removing item..." });
      const response = await fetch("/api/dashboard/continue-learning/hide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: pendingRemoveItem.subject })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to remove item.");
      }

      setVisibleItems((current) => current.filter((item) => item.subject !== pendingRemoveItem.subject));
      setPendingRemoveItem(null);
      setRemoveState({ status: "success", message: data.message || "Removed from Continue Learning." });
      window.dispatchEvent(new Event("studymind:dashboard-refresh"));
    } catch (removeError) {
      setPendingRemoveItem(null);
      setRemoveState({ status: "error", message: removeError.message || "Unable to remove item." });
    }
  }

  return (
    <section className="continue-section">
      <div className="section-heading">
        <h2>Continue Learning</h2>
      </div>

      {removeState.status !== "idle" && (
        <div className={`summary-export-status ${removeState.status}`}>
          <span>{removeState.message}</span>
        </div>
      )}

      {visibleItems.length ? (
        <div className="learning-grid">
          {visibleItems.map((item) => (
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
                <button type="button" onClick={() => setPendingRemoveItem(item)}>Remove</button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="panel continue-empty">
          <EmptyPanel
            title="No recent study activity yet."
            text=""
          />
          <a className="continue-library-link" href="#library">Go To Library</a>
        </div>
      )}

      {pendingRemoveItem && (
        <ConfirmationModal
          title="Remove from Continue Learning?"
          message="This will remove the item from your dashboard. Your PDFs, summaries, quizzes, flashcards, and folders will remain unchanged."
          confirmLabel="Remove"
          isConfirming={removeState.status === "loading"}
          onCancel={() => setPendingRemoveItem(null)}
          onConfirm={handleRemoveItem}
        />
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
      {text && <p>{text}</p>}
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

function formatDateTime(date) {
  if (!date) {
    return "Recently";
  }

  return new Date(date).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDuration(seconds) {
  const totalSeconds = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  if (minutes <= 0) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

function getScoreBand(score) {
  const value = Number(score || 0);

  if (value < 40) {
    return "low";
  }

  if (value < 70) {
    return "mid";
  }

  return "high";
}

function getScoreLabel(score) {
  const value = Number(score || 0);

  if (value >= 80) {
    return "Excellent";
  }

  if (value >= 60) {
    return "Good Progress";
  }

  if (value >= 40) {
    return "Needs Practice";
  }

  return "Review Recommended";
}

function getScoreMessage(score) {
  const value = Number(score || 0);

  if (value >= 80) {
    return "You answered most questions correctly. Review any missed explanations briefly before moving on.";
  }

  if (value >= 60) {
    return "You are close. Review the missed explanations, then retake to improve accuracy.";
  }

  if (value >= 40) {
    return "Review the incorrect and unanswered questions below before retaking the quiz.";
  }

  return "You missed or skipped several questions. Review the explanations below before retaking the quiz.";
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

function normalizeDisplayFileName(value) {
  return String(value || "")
    .replace(/\.pdf$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function quizResultStorageKey(quizId) {
  return `studymind:quiz-result:${quizId}`;
}

function saveQuizResult(result) {
  try {
    localStorage.setItem(quizResultStorageKey(result.quizId), JSON.stringify(result));
  } catch {
    // Result navigation still works in-memory during the current page lifecycle.
  }
}

function readQuizResult(quizId) {
  try {
    const raw = localStorage.getItem(quizResultStorageKey(quizId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function buildAnswersFromResult(result) {
  return (result?.answers || []).reduce((mapped, answer) => {
    if (Number.isInteger(answer.selectedAnswer)) {
      mapped[answer.questionNumber - 1] = answer.selectedAnswer;
    }

    return mapped;
  }, {});
}

function buildQuizResultPayload({ quizData, answers, attempt, timeTakenSeconds }) {
  const quiz = quizData.quiz;
  const completedAt = attempt?.completedAt || new Date().toISOString();
  const resultAnswers = quiz.questions.map((question, index) => {
    const selectedAnswer = Number.isInteger(answers[index]) ? answers[index] : null;
    const isUnanswered = selectedAnswer === null;
    const isCorrect = !isUnanswered && selectedAnswer === question.correctAnswer;
    const status = isUnanswered ? "unanswered" : isCorrect ? "correct" : "incorrect";

    return {
      questionId: question.id || `question-${index + 1}`,
      questionNumber: index + 1,
      questionText: question.question,
      options: question.options,
      selectedAnswer,
      selectedAnswerText: selectedAnswer === null ? "" : question.options[selectedAnswer],
      correctAnswer: question.correctAnswer,
      correctAnswerText: question.options[question.correctAnswer],
      explanation: question.explanation,
      topic: question.topic || question.category || quiz.topic || quiz.subject || "",
      status
    };
  });
  const correctCount = resultAnswers.filter((answer) => answer.status === "correct").length;
  const incorrectCount = resultAnswers.filter((answer) => answer.status === "incorrect").length;
  const unansweredCount = resultAnswers.filter((answer) => answer.status === "unanswered").length;
  const totalQuestions = resultAnswers.length;
  const scorePercentage = totalQuestions ? Math.round((correctCount / totalQuestions) * 100) : 0;

  return {
    quizId: quiz.id,
    attemptId: attempt?.id || "",
    documentId: quizData.document?.id || quiz.documentId || "",
    quizTitle: quiz.title || quizData.document?.title || "StudyMind Quiz",
    completedAt,
    totalQuestions,
    correctCount,
    incorrectCount,
    unansweredCount,
    scorePercentage,
    timeTakenSeconds,
    answers: resultAnswers,
    aiInsight: buildQuizInsight({ scorePercentage, correctCount, incorrectCount, unansweredCount, totalQuestions }),
    aiInsightGenerated: false
  };
}

function buildQuizInsightRequest(result) {
  return {
    quizTitle: result.quizTitle,
    scorePercentage: result.scorePercentage,
    correctCount: result.correctCount,
    incorrectCount: result.incorrectCount,
    unansweredCount: result.unansweredCount,
    totalQuestions: result.totalQuestions,
    answers: (result.answers || []).map((answer) => ({
      questionText: answer.questionText,
      status: answer.status,
      selectedAnswerText: answer.selectedAnswerText,
      correctAnswerText: answer.correctAnswerText,
      explanation: answer.explanation,
      topic: answer.topic || answer.category || ""
    }))
  };
}

function buildQuizInsight({ scorePercentage, correctCount, incorrectCount, unansweredCount, totalQuestions }) {
  if (!totalQuestions) {
    return "Review the questions answered incorrectly and revisit the related sections in your notes.";
  }

  if (scorePercentage >= 80) {
    return `Great work. You answered ${correctCount} of ${totalQuestions} questions correctly and appear confident with this material. Quickly review any missed questions before moving to the next topic. Retake only if you want to reinforce speed and accuracy.`;
  }

  if (scorePercentage >= 60) {
    return `You have a good understanding of this quiz, with ${correctCount} correct answers out of ${totalQuestions}. Review the explanations for the ${incorrectCount} incorrect and ${unansweredCount} unanswered questions. A quick retake after reviewing those explanations should improve accuracy.`;
  }

  if (scorePercentage >= 40) {
    return `You have a basic understanding, but several answers need more clarity. Review the incorrect and unanswered questions below, then revisit the related notes before retaking the quiz. Focus on why the correct answer is right instead of memorizing the option.`;
  }

  return `Your score shows that this quiz needs more revision. Start by reviewing the incorrect and unanswered questions below, then retake the quiz after revisiting the related notes. Focus on understanding why each correct answer is right rather than memorizing options.`;
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
  const structuredSections = parseTopicSections(text);

  if (structuredSections.length) {
    return structuredSections;
  }

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

  return (groups.length ? groups : [text]).map((group, index) => ({
    title: buildTopicTitle(group, index),
    text: group
  }));
}

function parseTopicSections(text) {
  const normalized = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\s*#{2,3}\s+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();

  if (!normalized.includes(":")) {
    return [];
  }

  const matches = [...normalized.matchAll(/(?:^|\n)\s*([^:\n]{3,90}):\s*([\s\S]*?)(?=\n\s*[^:\n]{3,90}:\s*|$)/g)];

  return matches
    .map((match, index) => ({
      title: cleanTopicTitle(match[1], index, match[2]),
      text: cleanDisplaySentence(match[2])
    }))
    .filter((section) => section.title && section.text);
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

function buildTopicTitle(text, index) {
  const cleaned = cleanDisplaySentence(text);
  const rawTitle = findBestTopicPhrase(cleaned);

  return cleanTopicTitle(rawTitle, index, cleaned);
}

function cleanTopicTitle(title, index = 0, sectionText = "") {
  const cleaned = String(title || "")
    .replace(/^#+\s*/, "")
    .replace(/^\s*[-–—:;,.]+/, "")
    .replace(/^\s*\d+[\).:-]\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.;:,!?]+$/g, "");

  if (!cleaned || isBadSummaryHeading(cleaned)) {
    const fallback = findBestTopicPhrase(sectionText);
    return fallback && !isBadSummaryHeading(fallback)
      ? toTitleCase(fallback)
      : index === 0 ? "Overview" : "Document Topic";
  }

  return toTitleCase(cleaned.split(/\s+/).slice(0, 8).join(" "));
}

function findBestTopicPhrase(text) {
  const cleaned = String(text || "")
    .replace(/["“”'‘’]/g, "")
    .replace(/\b(study note\s*\d*|revision strategy|exam focus|important note|learning point|topic\s*\d+|core ideas?|important details?|how it works|why it matters|key concepts?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return "";
  }

  const knownConcept = findKnownConceptPhrase(cleaned);

  if (knownConcept) {
    return knownConcept;
  }

  const candidates = new Map();
  const words = cleaned.match(/[A-Za-z][A-Za-z-]*/g) || [];

  for (let index = 0; index < words.length; index += 1) {
    for (let size = 3; size >= 2; size -= 1) {
      const phraseWords = words.slice(index, index + size);

      if (phraseWords.length !== size) {
        continue;
      }

      if (phraseWords.some((word) => isHeadingStopWord(word))) {
        continue;
      }

      const phrase = phraseWords.join(" ");
      const key = phrase.toLowerCase();
      const score = (candidates.get(key)?.score || 0) + size + (isTechnicalPhrase(phrase) ? 5 : 0);
      candidates.set(key, { phrase, score });
    }
  }

  const best = [...candidates.values()]
    .filter((candidate) => !isBadSummaryHeading(candidate.phrase))
    .sort((a, b) => b.score - a.score || a.phrase.length - b.phrase.length)[0];

  return best?.phrase || "";
}

function findKnownConceptPhrase(text) {
  const conceptPatterns = [
    /\bcloud service models?\b/i,
    /\bservice models?\b/i,
    /\bdeployment models?\b/i,
    /\bvirtualization\b/i,
    /\bcontainers?\b/i,
    /\bstorage systems?\b/i,
    /\bsecurity concepts?\b/i,
    /\bprocess(?:es)? and threads?\b/i,
    /\bscheduling algorithms?\b/i,
    /\bdeadlocks?\b/i,
    /\bmemory management\b/i,
    /\bfile systems?\b/i,
    /\bdatabase fundamentals?\b/i,
    /\bnormalization\b/i,
    /\bSQL operations?\b/i,
    /\btransactions?\b/i,
    /\bindexing\b/i
  ];

  for (const pattern of conceptPatterns) {
    const match = text.match(pattern);

    if (match) {
      return match[0];
    }
  }

  return "";
}

function isBadSummaryHeading(title) {
  const normalized = String(title || "").trim().toLowerCase();

  if (/^(study note\s*\d*|revision strategy|exam focus|important note|learning point|topic\s*\d+|core ideas?|important details?|how it works|why it matters|key concepts?)$/.test(normalized)) {
    return true;
  }

  if (/^(finally|here|therefore|however|moreover|furthermore|in addition|this means|for example|a public cloud|the|a|an)$/i.test(normalized)) {
    return true;
  }

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  return wordCount === 1 && !isTechnicalPhrase(normalized);
}

function isHeadingStopWord(word) {
  return /^(a|an|the|and|or|but|if|then|this|that|these|those|finally|here|therefore|however|moreover|furthermore|in|on|at|by|from|with|without|inside|outside|into|over|under|between|through|after|before|for|of|to|as|is|are|was|were|be|being|been|can|could|may|might|should|would|will|also|each|every|some|many|such)$/i
    .test(String(word || ""));
}

function isTechnicalPhrase(phrase) {
  return /\b(cloud|service|deployment|model|virtualization|container|storage|security|process|thread|scheduling|algorithm|deadlock|memory|file|database|normalization|SQL|transaction|index|network|architecture|system|computing|resource|server|application|platform|infrastructure|software|data|management)\b/i
    .test(String(phrase || ""));
}

function toTitleCase(value) {
  const smallWords = new Set(["and", "or", "of", "to", "in", "for", "with", "on", "the", "a", "an"]);

  return String(value || "")
    .split(" ")
    .map((word, index) => {
      if (word === word.toUpperCase() && word.length <= 5) {
        return word;
      }

      const lower = word.toLowerCase();

      if (index > 0 && smallWords.has(lower)) {
        return lower;
      }

      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
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
