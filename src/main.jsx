import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { jsPDF } from "jspdf";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  ArrowLeft,
  BookOpen,
  Bookmark,
  Brain,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
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
  Lightbulb,
  LineChart,
  LogOut,
  MessageCircle,
  MoreVertical,
  Maximize2,
  Minimize2,
  NotebookPen,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Save,
  Sparkles,
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
import "./styles.css";

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

const insightIcons = {
  revision: Target,
  focus: Brain,
  activity: Clock3,
  improving: LineChart
};

const TOAST_DISMISS_MS = 5000;
const ACTIVE_TEXT_MATERIAL_KEY = "studymind:active-text-material";
const QUIZ_INSIGHT_FALLBACK = "We couldn't generate an AI insight for this attempt. Review the incorrect and unanswered questions below, then retake the quiz after revising the summary.";
const longLoadingMessages = [
  "Analyzing content...",
  "Extracting key concepts...",
  "Preparing AI insights...",
  "Almost ready..."
];

function LoadingSpinner({ size = "md" }) {
  return <span className={`loading-spinner ${size}`} aria-hidden="true" />;
}

function AnimatedDots() {
  const [dots, setDots] = useState(".");

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setDots((current) => (current.length >= 3 ? "." : `${current}.`));
    }, 420);

    return () => window.clearInterval(intervalId);
  }, []);

  return <span className="loading-dots" aria-hidden="true">{dots}</span>;
}

function useLongLoadingMessage(messages = longLoadingMessages, delayMs = 5000, rotateMs = 2600) {
  const [messageIndex, setMessageIndex] = useState(-1);

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

function LoadingBanner({
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

function cleanLoadingTitle(title = "Loading") {
  return String(title).replace(/\.+$/g, "").trim() || "Loading";
}

function LoadingButton({
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

  async function handleAuthenticated(userData) {
    setDashboard(null);
    setAuth({ status: "authenticated", user: userData });
    window.location.hash = "#dashboard";
  }

  function handleProfileUpdated(userData) {
    setAuth({ status: "authenticated", user: userData });
    setDashboard((current) => current ? { ...current, user: userData } : current);
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
                <DashboardSkeleton />
              </>
            )}
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

function getActiveTextMaterialId() {
  try {
    return localStorage.getItem(ACTIVE_TEXT_MATERIAL_KEY) || "";
  } catch {
    return "";
  }
}

function setActiveTextMaterialId(documentId) {
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

function getNavigationHref(item) {
  if (!["summary", "quizzes", "flashcards"].includes(item.page)) {
    return item.href;
  }

  const documentId = getActiveTextMaterialId();
  return documentId ? `${item.href}?documentId=${encodeURIComponent(documentId)}` : item.href;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function getUserInitials(user = {}) {
  return String(user.name || user.email || "U")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function buildProfileStats(dashboard, liveStudySeconds = 0) {
  const stats = dashboard?.stats || {};
  const totalStudyMinutes = Number(stats.totalStudyMinutes || 0) + Math.floor(Number(liveStudySeconds || 0) / 60);

  return [
    { label: "PDFs Uploaded", value: Number(stats.documentsUploaded || 0) },
    { label: "Quiz Attempts", value: Number(stats.quizAttempts || 0) },
    { label: "Flashcards Generated", value: Number(stats.flashcardsGenerated || 0) },
    { label: "Total Study Time", value: formatStudyMinutes(totalStudyMinutes) },
    { label: "Average Quiz Score", value: `${Number(stats.averageScore || 0)}%` }
  ];
}

function formatStudyMinutes(minutes) {
  const totalMinutes = Math.max(0, Math.round(Number(minutes || 0)));
  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${totalMinutes}m`;
  }

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}m`;
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
  const [, setActiveMaterialVersion] = useState(0);
  const initials = getUserInitials(user);

  useEffect(() => {
    const handleActiveMaterialChange = () => {
      setActiveMaterialVersion((version) => version + 1);
    };

    window.addEventListener("studymind:active-material-change", handleActiveMaterialChange);
    return () => window.removeEventListener("studymind:active-material-change", handleActiveMaterialChange);
  }, []);

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="brand">
        <div className="brand-mark">
          <GraduationCap size={24} />
        </div>
        <span>StudyMind AI</span>
      </div>
      <button
        className="sidebar-toggle"
        type="button"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        onClick={onToggle}
      >
        {collapsed ? <ChevronRight size={22} /> : <ChevronLeft size={22} />}
      </button>

      <nav className="sidebar-nav" aria-label="Primary navigation">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          return (
            <a
              className={`nav-item ${item.page === activePage ? "active" : ""}`}
              data-tooltip={item.label}
              href={getNavigationHref(item)}
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
            <a href="#profile" onClick={() => setMenuOpen(false)}>
              <UserCircle size={17} />
              <span>Profile</span>
            </a>
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
        autoComplete="email"
        error={errors.email}
        label="Email Address"
        name="email"
        onChange={setForm}
        type="email"
        value={form.email}
      />
      <AuthField
        autoComplete="current-password"
        error={errors.password}
        label="Password"
        name="password"
        onChange={setForm}
        type="password"
        value={form.password}
      />

      <LoadingButton
        className="auth-primary-button"
        isLoading={status === "loading"}
        loadingLabel="Logging in"
        type="submit"
      >
        Login
      </LoadingButton>
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
        autoComplete="name"
        error={errors.name}
        label="Full Name"
        name="name"
        onChange={setForm}
        value={form.name}
      />
      <AuthField
        autoComplete="email"
        error={errors.email}
        label="Email Address"
        name="email"
        onChange={setForm}
        type="email"
        value={form.email}
      />
      <AuthField
        autoComplete="new-password"
        error={errors.password}
        label="Password"
        name="password"
        onChange={setForm}
        type="password"
        value={form.password}
      />
      <AuthField
        autoComplete="new-password"
        error={errors.confirmPassword}
        label="Confirm Password"
        name="confirmPassword"
        onChange={setForm}
        type="password"
        value={form.confirmPassword}
      />

      <LoadingButton
        className="auth-primary-button"
        isLoading={status === "loading"}
        loadingLabel="Creating account"
        type="submit"
      >
        Create Account
      </LoadingButton>
      <button className="auth-secondary-button" type="button" onClick={onLogin}>
        Login
      </button>
    </form>
  );
}

function AuthField({ autoComplete, error, label, name, onChange, type = "text", value }) {
  return (
    <label className="auth-field">
      <span>{label}</span>
      <input
        aria-invalid={Boolean(error)}
        autoComplete={autoComplete}
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

const workflowSteps = [
  {
    title: "Upload PDF / Text",
    description: "Upload your PDFs or paste study text to start building your learning workspace.",
    icon: Upload,
    tone: "purple",
    href: "#library"
  },
  {
    title: "Generate AI Summary",
    description: "Get concise notes, key points, and important concepts from your documents.",
    icon: FileText,
    tone: "green",
    href: "#summary"
  },
  {
    title: "Ask the AI Tutor",
    description: "Use AI Tutor to clarify doubts and understand difficult topics.",
    icon: MessageCircle,
    tone: "blue",
    href: "#summary"
  },
  {
    title: "Review Flashcards",
    description: "Reinforce your learning with AI-generated flashcards.",
    icon: BookOpen,
    tone: "gold",
    href: "#flashcards"
  },
  {
    title: "Take Quiz",
    description: "Test your understanding with AI-generated questions.",
    icon: ClipboardList,
    tone: "pink",
    href: "#quizzes"
  },
  {
    title: "Review Weak Topics",
    description: "Identify your weak areas and revisit the concepts that need improvement.",
    icon: Brain,
    tone: "orange",
    href: "#review"
  },
  {
    title: "Create Notes",
    description: "Copy AI summaries, add your own points, and build a personal revision notebook.",
    icon: NotebookPen,
    tone: "gold",
    href: "#notes"
  },
  {
    title: "Track Progress",
    description: "Monitor your learning activity and performance from the Dashboard and Analytics sections.",
    icon: LineChart,
    tone: "teal",
    href: "#dashboard"
  }
];

const studyFlowSteps = [
  { label: "Upload PDF / Text", description: "Add your study material", icon: Upload, tone: "purple" },
  { label: "AI Summary", description: "Get key points and notes", icon: FileText, tone: "green" },
  { label: "AI Tutor", description: "Clarify doubts and concepts", icon: MessageCircle, tone: "blue" },
  { label: "Flashcards", description: "Review and memorize", icon: BookOpen, tone: "gold" },
  { label: "Quiz", description: "Test your understanding", icon: ClipboardList, tone: "pink" },
  { label: "Weak Topics", description: "Focus on areas that need work", icon: Brain, tone: "orange" },
  { label: "Notes", description: "Build your notebook", icon: NotebookPen, tone: "gold" },
  { label: "Track Progress", description: "Monitor growth", icon: LineChart, tone: "teal" }
];

function HowItWorksPage() {
  return (
    <div className="how-page">
      <header className="how-header">
        <a className="how-back-button" href="#dashboard">
          <ArrowLeft size={18} />
          <span>Back</span>
        </a>
        <h1>How It Works</h1>
        <p>Learn the complete StudyMind AI workflow from uploading content to revision and progress tracking.</p>
      </header>

      <section className="how-steps-grid" aria-label="StudyMind workflow steps">
        {workflowSteps.map((step, index) => {
          const Icon = step.icon;
          const stepNumber = String(index + 1).padStart(2, "0");

          return (
            <a
              aria-label={`${step.title}: ${step.description}`}
              className={`how-step-card ${step.tone}`}
              href={step.href}
              key={step.title}
            >
              <div className="how-icon-square">
                <Icon size={28} />
              </div>
              <div className="how-step-copy">
                <span>STEP {index + 1}</span>
                <h2>{step.title}</h2>
                <p>{step.description}</p>
              </div>
              <strong aria-hidden="true">{stepNumber}</strong>
            </a>
          );
        })}
      </section>

      <section className="how-flow-card">
        <div className="how-section-heading">
          <h2>Recommended Study Flow</h2>
          <p>Follow this proven workflow to master any topic.</p>
        </div>
        <div className="how-flow-track" aria-label="Recommended Study Flow">
          {studyFlowSteps.map((step, index) => {
            const Icon = step.icon;

            return (
              <React.Fragment key={step.label}>
                <div className={`how-flow-item ${step.tone}`}>
                  <div className="how-flow-icon">
                    <Icon size={26} />
                  </div>
                  <strong>{step.label}</strong>
                  <span>{step.description}</span>
                </div>
                {index < studyFlowSteps.length - 1 && <span className="how-flow-arrow" aria-hidden="true">→</span>}
              </React.Fragment>
            );
          })}
        </div>
        <div className="how-return-cycle" aria-hidden="true">
          <span />
        </div>
      </section>

      <section className="how-tip-card">
        <div className="how-tip-main">
          <div className="how-tip-icon">
            <Lightbulb size={28} />
          </div>
          <div>
            <h2>Pro Tip</h2>
            <p>Consistency is the key! Follow the workflow regularly and use the Weak Topics section to focus your revision.</p>
          </div>
        </div>
        <div className="how-tip-result">
          <Trophy size={34} />
          <strong>Small steps every day lead to big results!</strong>
        </div>
      </section>
    </div>
  );
}

function ProfilePage({ user, dashboard, status, error, liveStudySeconds = 0, onLogout, onProfileUpdated }) {
  const [activeAction, setActiveAction] = useState("");
  const initials = getUserInitials(user);
  const stats = buildProfileStats(dashboard, liveStudySeconds);

  return (
    <div className="profile-page">
      <section className="profile-hero-card">
        <div className="profile-identity">
          <div className="profile-avatar-large">{initials}</div>
          <div>
            <span className="summary-breadcrumb">Profile</span>
            <h1>{user.name}</h1>
            <p>{user.email}</p>
          </div>
        </div>
        <div className="profile-action-row">
          <button type="button" onClick={() => setActiveAction("name")}>Edit Name</button>
          <button type="button" onClick={() => setActiveAction("email")}>Change Email</button>
          <button type="button" onClick={() => setActiveAction("password")}>Change Password</button>
        </div>
      </section>

      <section className="profile-overview-card">
        <div className="profile-section-heading">
          <span className="summary-section-label">Study Overview</span>
        </div>
        {status === "loading" && !dashboard ? (
          <LoadingBanner
            compact
            title="Loading study overview"
            detail="Summarizing your progress and activity."
          />
        ) : status === "error" ? (
          <div className="profile-overview-loading error">{error || "Unable to load study overview."}</div>
        ) : (
          <div className="profile-stats-row" aria-label="Profile study overview">
            {stats.map((stat) => (
              <article className="profile-stat-card" key={stat.label}>
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="profile-logout-card">
        <div>
          <span className="summary-section-label">Session</span>
          <h2>Logout</h2>
        </div>
        <button className="profile-logout-button" type="button" onClick={onLogout}>
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </section>

      {activeAction && (
        <ProfileActionModal
          action={activeAction}
          user={user}
          onClose={() => setActiveAction("")}
          onUpdated={(updatedUser) => {
            onProfileUpdated(updatedUser);
            setActiveAction("");
          }}
        />
      )}
    </div>
  );
}

function ProfileActionModal({ action, user, onClose, onUpdated }) {
  const config = {
    name: {
      title: "Edit Name",
      submitLabel: "Save Name",
      initialForm: { name: user.name || "" }
    },
    email: {
      title: "Change Email",
      submitLabel: "Save Email",
      initialForm: { email: user.email || "" }
    },
    password: {
      title: "Change Password",
      submitLabel: "Save Password",
      initialForm: { currentPassword: "", password: "", confirmPassword: "" }
    }
  }[action];
  const [form, setForm] = useState(config.initialForm);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [requestStatus, setRequestStatus] = useState("idle");

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = {};

    if (action === "name" && !form.name.trim()) {
      nextErrors.name = "Name is required.";
    }

    if (action === "email" && !isValidEmail(form.email)) {
      nextErrors.email = "Valid email is required.";
    }

    if (action === "password") {
      if (!form.currentPassword) {
        nextErrors.currentPassword = "Current password is required.";
      }

      if (form.password.length < 8) {
        nextErrors.password = "Password must be at least 8 characters.";
      }

      if (form.password !== form.confirmPassword) {
        nextErrors.confirmPassword = "Passwords do not match.";
      }
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length) {
      return;
    }

    try {
      setRequestStatus("loading");
      setMessage("");
      const response = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...form })
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (data.field) {
          setErrors({ [data.field]: data.message || "Unable to update profile." });
        }

        throw new Error(data.message || "Unable to update profile.");
      }

      onUpdated(data.user);
    } catch (updateError) {
      setMessage(updateError.message || "Unable to update profile.");
      setRequestStatus("error");
    }
  }

  return (
    <div className="confirmation-overlay" role="dialog" aria-modal="true" aria-labelledby="profile-action-title">
      <form className="profile-action-modal" onSubmit={handleSubmit}>
        <div className="profile-modal-heading">
          <h2 id="profile-action-title">{config.title}</h2>
          <button type="button" onClick={onClose} aria-label="Close profile form">
            <X size={18} />
          </button>
        </div>
        {message && <div className="auth-message error">{message}</div>}
        {action === "name" && (
          <AuthField autoComplete="name" error={errors.name} label="Name" name="name" value={form.name} onChange={setForm} />
        )}
        {action === "email" && (
          <AuthField autoComplete="email" error={errors.email} label="Email" name="email" type="email" value={form.email} onChange={setForm} />
        )}
        {action === "password" && (
          <>
            <AuthField autoComplete="current-password" error={errors.currentPassword} label="Current Password" name="currentPassword" type="password" value={form.currentPassword} onChange={setForm} />
            <AuthField autoComplete="new-password" error={errors.password} label="New Password" name="password" type="password" value={form.password} onChange={setForm} />
            <AuthField autoComplete="new-password" error={errors.confirmPassword} label="Confirm New Password" name="confirmPassword" type="password" value={form.confirmPassword} onChange={setForm} />
          </>
        )}
        <div className="profile-modal-actions">
          <button className="auth-secondary-button" type="button" onClick={onClose}>Cancel</button>
          <LoadingButton
            className="auth-primary-button"
            isLoading={requestStatus === "loading"}
            loadingLabel="Saving"
            type="submit"
          >
            {config.submitLabel}
          </LoadingButton>
        </div>
      </form>
    </div>
  );
}

function UploadTextPage() {
  const [title, setTitle] = useState("");
  const [studyText, setStudyText] = useState("");
  const [documentId, setDocumentId] = useState(() => getActiveTextMaterialId());
  const [activeAction, setActiveAction] = useState("");
  const [message, setMessage] = useState({ status: "idle", message: "" });
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const maxCharacters = 20000;
  useAutoDismissStatus(message, setMessage);

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

  function handleClearRequest() {
    if (!title.trim() && !studyText.trim()) {
      return;
    }

    setClearConfirmOpen(true);
  }

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

  useEffect(() => {
    loadFolders();
  }, []);

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

  function createFolder() {
    setFolderModal({ mode: "create", folder: null });
    setFolderModalError("");
  }

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

function FolderNameModal({ error, initialName = "", mode, onClose, onSubmit, status }) {
  const [name, setName] = useState(initialName);
  const inputRef = useRef(null);
  const isRename = mode === "rename";
  const isLoading = status === "loading";

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

function getFolderReviewInfo(reviewFolderCards, folder) {
  return reviewFolderCards.find((item) => item.folderId === folder.id) || {
    folderId: folder.id,
    folderName: folder.name,
    savedSummaryCount: 0,
    markedQuestionCount: 0
  };
}

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

  const folderCards = useMemo(
    () => buildReviewFolderCards(summaryGroups, questionGroups),
    [summaryGroups, questionGroups]
  );

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

function NotesPage() {
  const [notes, setNotes] = useState([]);
  const [selectedNote, setSelectedNote] = useState(null);
  const [form, setForm] = useState({ title: "", content: "" });
  const [mode, setMode] = useState("list");
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState({ status: "idle", message: "" });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  useAutoDismissStatus(message, setMessage);

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

  useEffect(() => {
    setChatMessages([]);
    setChatInput("");
    setChatStatus("idle");
    setChatError("");
  }, [documentId]);

  useEffect(() => {
    if (!summaryData?.document?.id) {
      return;
    }

    setActiveTextMaterialId(
      summaryData.document.fileType === "text" ? summaryData.document.id : ""
    );
  }, [summaryData?.document?.id, summaryData?.document?.fileType]);

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
          summaryText: currentSummaryText,
          questions: selectedPdfType === "detailed" ? questions.map((item) => item.question || item) : []
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
        questions: data.importantQuestions?.length ? data.importantQuestions : questions,
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
    return (
      <>
        <LoadingBanner
          title="Loading AI Summary"
          detail="Fetching document summary and review material."
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
  const questions = summaryData.questions || [];
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
                <strong>{cleanDisplaySentence(item.question)}</strong>
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

function ConfirmationModal({
  confirmClassName = "danger",
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
    if (!quizData?.document?.id) {
      return;
    }

    setActiveTextMaterialId(
      quizData.document.fileType === "text" ? quizData.document.id : ""
    );
  }, [quizData?.document?.id, quizData?.document?.fileType]);

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

  useEffect(() => {
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }, [quizId]);

  useEffect(() => {
    setInsight(result?.aiInsightGenerated ? result.aiInsight || "" : "");
    setInsightStatus("idle");
  }, [result?.quizId]);

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
  const [deckComplete, setDeckComplete] = useState(false);
  const [savingState, setSavingState] = useState("idle");
  const [deleteState, setDeleteState] = useState({
    status: "idle",
    message: ""
  });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const activeFlashcardSetIdRef = useRef("");
  activeFlashcardSetIdRef.current = deckData?.flashcardSet?.id || "";
  useAutoDismissStatus(deleteState, setDeleteState);

  useEffect(() => {
    if (!deckData?.document?.id) {
      return;
    }

    setActiveTextMaterialId(
      deckData.document.fileType === "text" ? deckData.document.id : ""
    );
  }, [deckData?.document?.id, deckData?.document?.fileType]);

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
        setCurrentIndex(data.progress?.currentCardIndex || 0);
        setIsFlipped(false);
        setDeckComplete(false);
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

  async function handleGenerateFlashcards() {
    if (isGenerating) {
      return;
    }

    try {
      setIsGenerating(true);
      setError("");
      setSavingState("idle");
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
      setDeckComplete(false);
      setSavingState("idle");
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

  async function saveProgress(nextIndex, rating = "") {
    if (!deckData?.flashcardSet) {
      return;
    }

    const flashcardSetId = deckData.flashcardSet.id;

    try {
      setSavingState("saving");
      const response = await fetch(`/api/flashcards/${flashcardSetId}/review`, {
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

      setDeckData((current) => (
        current?.flashcardSet?.id === flashcardSetId
          ? { ...current, progress: data.progress }
          : current
      ));
      if (activeFlashcardSetIdRef.current === flashcardSetId) {
        setSavingState("saved");
      }
    } catch (saveError) {
      if (activeFlashcardSetIdRef.current === flashcardSetId) {
        setSavingState("error");
        setError(saveError.message || "Could not save flashcard progress.");
      }
    }
  }

  function goToCard(nextIndex) {
    const count = deckData?.flashcardSet?.cards?.length || 0;

    if (nextIndex >= count) {
      const existingRating = getLatestFlashcardRating(deckData?.progress?.reviewHistory || [], currentCard?.order);
      setCurrentIndex(count);
      setDeckComplete(true);
      setIsFlipped(false);
      saveProgress(Math.max(0, count - 1), existingRating || "got-it");
      return;
    }

    const safeIndex = Math.min(count - 1, Math.max(0, nextIndex));
    const existingRating = getLatestFlashcardRating(deckData?.progress?.reviewHistory || [], currentCard?.order);
    setCurrentIndex(safeIndex);
    setDeckComplete(false);
    setIsFlipped(false);
    saveProgress(safeIndex, nextIndex > currentIndex ? existingRating || "got-it" : "");
  }

  function handleReview(rating) {
    const count = deckData?.flashcardSet?.cards?.length || 0;
    const nextIndex = Math.min(count - 1, currentIndex + 1);
    saveProgress(nextIndex, rating);

    if (currentIndex < count - 1) {
      setCurrentIndex(nextIndex);
      setDeckComplete(false);
      setIsFlipped(false);
    } else {
      setCurrentIndex(count);
      setDeckComplete(true);
      setIsFlipped(false);
    }
  }

  function restartDeck() {
    setCurrentIndex(0);
    setDeckComplete(false);
    setIsFlipped(false);
    saveProgress(0);
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
      setDeckComplete(false);
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
  const completionStats = buildDeckCompletionStats(cards.length, deckData?.progress?.reviewHistory || []);
  const displayedProgressIndex = deckComplete ? cards.length : Math.min(currentIndex + 1, cards.length);
  const progressPercent = cards.length ? Math.round((displayedProgressIndex / cards.length) * 100) : 0;

  if (status === "loading") {
    return (
      <>
        <LoadingBanner
          title="Loading AI flashcards"
          detail="Fetching your deck and review progress."
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

      {deck && (currentCard || deckComplete) && (
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
              <strong>{deckComplete ? "Complete" : `${currentIndex + 1}/${cards.length}`}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{savingState === "saving" ? "Saving..." : savingState === "error" ? "Save failed" : "Saved"}</strong>
            </div>
          </section>

          {savingState === "saving" && (
            <LoadingBanner
              compact
              title="Saving progress"
              detail="Recording your flashcard review."
            />
          )}

          <section className="flashcard-study-area">
            {deckComplete ? (
              <DeckCompleteCard
                documentId={deckData?.document?.id || deck.documentId || documentId}
                onRestart={restartDeck}
                stats={completionStats}
              />
            ) : (
              <>
                <button
                  aria-label="Previous card"
                  className="flash-nav-button previous"
                  type="button"
                  onClick={() => goToCard(currentIndex - 1)}
                  disabled={currentIndex === 0 || isGenerating}
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
              </>
            )}
          </section>

          <section className="flashcard-controls">
            <div className="flash-progress">
              <span style={{ width: `${progressPercent}%` }} />
            </div>
            {!deckComplete && (
              <div className="flash-review-buttons">
                <button className="again" type="button" onClick={() => handleReview("again")}>Didn&apos;t Know</button>
                <button className="got-it" type="button" onClick={() => handleReview("got-it")}>Got It</button>
              </div>
            )}
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

function FlashcardGuideModal({ onClose }) {
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
      title: "Got It",
      text: "Mark it if you understand the concept well."
    },
    {
      title: "Didn't Know",
      text: "Mark it if you need more revision on this topic."
    },
    {
      title: "Track your mastery",
      text: "Your responses help us calculate your mastery score."
    },
    {
      title: "Get smart recommendations",
      text: "At the end, we'll recommend whether you're ready for the quiz or should review more."
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
          <button type="button" onClick={onClose}>Got it</button>
        </div>
      </section>
    </div>
  );
}

function DeckCompleteCard({ documentId, onRestart, stats }) {
  const summaryHref = `#summary?documentId=${documentId || ""}`;
  const quizHref = `#quizzes?documentId=${documentId || ""}`;
  const insightParts = getDeckCompletionInsight(stats.status);

  return (
    <article className={`deck-complete-card ${stats.status}`}>
      <h2>🎉 Deck Complete</h2>
      <strong>Mastery Score: {stats.mastery}%</strong>
      <span className="deck-readiness">{getDeckReadinessLabel(stats.status)}</span>
      <div className="deck-rating-counts" aria-label="Flashcard rating counts">
        <span>✅ Got It: {stats.gotIt}</span>
        <span>❌ Didn&apos;t Know: {stats.didntKnow}</span>
      </div>
      <p>
        {insightParts.beforeSummary}
        {insightParts.includeLinks && <a href={summaryHref}>AI Summary</a>}
        {insightParts.betweenLinks}
        {insightParts.includeLinks && <a href={summaryHref}>AI Tutor</a>}
        {insightParts.afterTutor}
      </p>
      <div className="deck-complete-actions">
        <a className="summary-primary-action" href={quizHref}>Start Quiz</a>
        <button className="summary-primary-action secondary" type="button" onClick={onRestart}>Restart Deck</button>
      </div>
    </article>
  );
}

function buildDeckCompletionStats(cardCount, reviewHistory = []) {
  const latestRatings = new Map();

  reviewHistory.forEach((item) => {
    const cardOrder = Number(item.cardOrder);

    if (Number.isFinite(cardOrder) && cardOrder >= 1 && cardOrder <= cardCount && item.rating) {
      latestRatings.set(cardOrder, item.rating);
    }
  });

  const ratings = Array.from({ length: cardCount }, (_, index) => latestRatings.get(index + 1) || "got-it");
  const gotIt = ratings.filter((rating) => rating !== "again").length;
  const didntKnow = ratings.filter((rating) => rating === "again").length;
  const mastery = cardCount ? Math.round((gotIt / cardCount) * 100) : 0;
  const status = mastery >= 80 ? "high" : mastery >= 60 ? "medium" : "low";

  return {
    gotIt,
    didntKnow,
    mastery,
    status
  };
}

function getLatestFlashcardRating(reviewHistory = [], cardOrder) {
  const targetOrder = Number(cardOrder);

  if (!Number.isFinite(targetOrder)) {
    return "";
  }

  for (let index = reviewHistory.length - 1; index >= 0; index -= 1) {
    const item = reviewHistory[index];

    if (Number(item.cardOrder) === targetOrder && item.rating) {
      return item.rating;
    }
  }

  return "";
}

function getDeckReadinessLabel(status) {
  if (status === "high") {
    return "Quiz Ready";
  }

  if (status === "medium") {
    return "Needs Quick Review";
  }

  return "More Review Recommended";
}

function getDeckCompletionInsight(status) {
  if (status === "high") {
    return {
      beforeSummary: "Excellent work. You appear ready to test your knowledge.",
      betweenLinks: "",
      afterTutor: "",
      includeLinks: false
    };
  }

  if (status === "medium") {
    return {
      beforeSummary: "You understand most concepts, but a few areas may need reinforcement. Consider revisiting the ",
      betweenLinks: " or asking the ",
      afterTutor: " about any remaining doubts before taking the quiz.",
      includeLinks: true
    };
  }

  return {
    beforeSummary: "Several concepts were marked as 'Didn't Know'. Review the ",
    betweenLinks: " and clear any doubts with the ",
    afterTutor: " before attempting the quiz.",
    includeLinks: true
  };
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
            suffix={stat.key === "studyStreak"
              ? Number(dashboard.stats[stat.key]) === 1 ? " Day" : " Days"
              : stat.suffix}
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
        {saveStatus === "saving" && (
          <LoadingBanner
            className="goal-saving-banner"
            compact
            title="Saving goal"
            detail="Updating today's target."
          />
        )}
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
  return Number(value || 0).toFixed(1);
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

      {removeState.status === "loading" && (
        <LoadingBanner
          compact
          title={removeState.message || "Removing item"}
          detail="Updating your dashboard preferences."
        />
      )}
      {removeState.status !== "idle" && removeState.status !== "loading" && (
        <div className={`summary-export-status ${removeState.status}`}>
          <span>{removeState.message}</span>
        </div>
      )}

      {visibleItems.length ? (
        <div className="learning-grid">
          {visibleItems.map((item) => (
            <article className="learning-card" key={item.subject}>
              <button
                className="learning-dismiss"
                type="button"
                aria-label={`Remove ${item.subject} from Continue Learning`}
                onClick={() => setPendingRemoveItem(item)}
              >
                <X size={16} />
              </button>
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
      selectedAnswer: answer.selectedAnswer,
      correctAnswer: answer.correctAnswer,
      options: answer.options,
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
  const cleanText = stripMarkdownArtifacts(text);
  const structuredSections = parseTopicSections(cleanText);

  if (structuredSections.length) {
    return structuredSections;
  }

  const sentences = cleanText
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

  return (groups.length ? groups : [cleanText]).map((group, index) => ({
    title: buildTopicTitle(group, index),
    text: group
  }));
}

function parseTopicSections(text) {
  const normalized = stripMarkdownArtifacts(text)
    .replace(/\r\n/g, "\n")
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
  return stripMarkdownArtifacts(sentence)
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
  const cleaned = stripMarkdownArtifacts(title)
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

function buildSummaryDisplaySections(text, length) {
  const sections = splitSummaryIntoSections(text, length);

  if (length === "detailed") {
    return ensureOverviewFirst(sections);
  }

  const compactSections = sections
    .map((section) => ({
      ...section,
      text: normalizeCompactSummaryParagraph(section.text)
    }))
    .filter((section) => section.text);

  const minimumCount = length === "short" ? 3 : 5;
  const maximumCount = length === "short" ? 5 : 7;
  const targetCount = length === "short" ? 3 : 6;

  if (compactSections.length >= minimumCount) {
    return ensureOverviewFirst(compactSections, maximumCount);
  }

  return ensureOverviewFirst(
    expandCompactSummarySections(compactSections, targetCount),
    maximumCount
  );
}

function ensureOverviewFirst(sections, maximumCount) {
  if (!sections.length) {
    return sections;
  }

  const firstSection = sections[0];
  const hasRealOverview = /^(overview\b.*|introduction\b.*)$/i.test(firstSection.title);
  const normalizedSections = hasRealOverview
    ? [{ ...firstSection, title: "Overview" }, ...sections.slice(1)]
    : [
        {
          title: "Overview",
          text: buildDocumentOverview(sections)
        },
        ...sections
      ];

  return maximumCount
    ? normalizedSections.slice(0, maximumCount)
    : normalizedSections;
}

function buildDocumentOverview(sections) {
  const sentences = sections.flatMap((section, sectionIndex) => (
    splitCompactSummarySentences(section.text).map((sentence, sentenceIndex) => ({
      sentence,
      order: sectionIndex * 10 + sentenceIndex,
      score: scoreOverviewSentence(sentence, sectionIndex)
    }))
  ));
  const selected = [...sentences]
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, 2)
    .sort((a, b) => a.order - b.order)
    .map(({ sentence }) => sentence);

  return selected.join(" ") || sections[0]?.text || "";
}

function scoreOverviewSentence(sentence, sectionIndex) {
  const text = String(sentence || "");
  let score = sectionIndex === 0 ? 1 : 0;

  if (/\b(DBMS|database management system|cloud computing|operating system|computer network|software engineering|data structure|machine learning|artificial intelligence|cybersecurity|web development)\b/i.test(text)) {
    score += 6;
  }

  if (/\b(is|are|refers to|means|is defined as|provides|enables|helps)\b/i.test(text)) {
    score += 3;
  }

  if (/\b(purpose|used to|manages?|organizes?|covers?|focuses on|allows?)\b/i.test(text)) {
    score += 2;
  }

  return score;
}

function formatSummaryForClipboard(title, text, length) {
  const hasBulletLines = /(?:^|\n)\s*[-*+•]\s+\S/m.test(String(text || ""));
  const rawLines = String(text || "").replace(/\r\n/g, "\n").split(/\n+/);
  const formattedRawLines = rawLines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const bulletMatch = line.match(/^\s*[-*+•]\s+(.+)$/);

      if (bulletMatch) {
        return `• ${cleanClipboardText(bulletMatch[1])}`;
      }

      const headingMatch = line.match(/^\s*#{1,6}\s+(.+)$/);

      if (headingMatch) {
        return cleanTopicTitle(headingMatch[1], index);
      }

      const separatorIndex = line.indexOf(":");

      if (separatorIndex > 0 && separatorIndex <= 90) {
        const heading = cleanTopicTitle(line.slice(0, separatorIndex), index, line.slice(separatorIndex + 1));
        const paragraph = cleanClipboardText(line.slice(separatorIndex + 1));
        return `${heading}\n\n${paragraph}`;
      }

      return cleanClipboardText(line);
    });
  const displayedContent = buildSummaryDisplaySections(text, length)
    .map((section) => `${section.title}\n\n${section.text}`)
    .join("\n\n");
  const content = hasBulletLines
    ? formattedRawLines.join("\n\n")
    : displayedContent;

  return `${stripMarkdownArtifacts(title).toUpperCase()}\n\n${content}`.trim();
}

function cleanClipboardText(text) {
  return normalizeTechnicalCapitalization(String(text || "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/^\s*#{1,6}\s*/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[ \t]+/g, " ")
    .trim());
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back for browsers that expose Clipboard API but deny the request.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Clipboard copy failed.");
  }
}

function normalizeCompactSummaryParagraph(text) {
  const parts = stripMarkdownArtifacts(text)
    .split(/\n+|;+/)
    .map(cleanDisplaySentence)
    .filter(Boolean);

  if (parts.length <= 1) {
    return parts[0] || "";
  }

  return parts
    .map((part) => /[.!?]$/.test(part) ? part : `${part}.`)
    .join(" ");
}

function expandCompactSummarySections(sections, targetCount) {
  const sentences = sections
    .flatMap((section) => splitCompactSummarySentences(section.text))
    .filter(Boolean);

  if (sentences.length < 2) {
    return sections;
  }

  const groupCount = Math.min(targetCount, sentences.length);
  const groups = Array.from({ length: groupCount }, () => []);

  sentences.forEach((sentence, index) => {
    const groupIndex = Math.min(
      Math.floor(index * groupCount / sentences.length),
      groupCount - 1
    );
    groups[groupIndex].push(sentence);
  });

  const usedTitles = new Set();

  return groups
    .map((group, index) => {
      const text = group.join(" ");
      const preferredTitle = index === 0 ? sections[0]?.title : buildTopicTitle(text, index);
      const title = makeUniqueSummaryTitle(preferredTitle, usedTitles, index);
      usedTitles.add(title.toLowerCase());
      return { title, text };
    })
    .filter((section) => section.text);
}

function splitCompactSummarySentences(text) {
  return stripMarkdownArtifacts(text)
    .split(/\n+|;+\s*|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map(cleanDisplaySentence)
    .filter(Boolean);
}

function makeUniqueSummaryTitle(title, usedTitles, index) {
  const cleaned = cleanTopicTitle(title, index);

  if (!usedTitles.has(cleaned.toLowerCase())) {
    return cleaned;
  }

  const fallbacks = [
    "Introduction and Core Concepts",
    "Key Principles",
    "Main Components",
    "Important Processes",
    "Applications and Examples",
    "Essential Takeaways"
  ];

  return fallbacks.find((fallback) => !usedTitles.has(fallback.toLowerCase()))
    || `Key Concept ${index + 1}`;
}

function splitSummaryPoints(text) {
  const cleaned = stripMarkdownArtifacts(text);
  const points = cleaned
    .split(/\n+|[;•]+|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map(cleanDisplaySentence)
    .filter(Boolean);

  return [...new Set(points)];
}

function stripMarkdownArtifacts(text) {
  return normalizeTechnicalCapitalization(String(text || "")
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[a-z]*|```/gi, ""))
    .replace(/!\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*>+\s*/gm, "")
    .replace(/[*#`]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/:\./g, ".")
    .replace(/\.{2,}/g, ".")
    .trim());
}

function normalizeTechnicalCapitalization(value) {
  const terms = [
    ["dbms", "DBMS"],
    ["sql", "SQL"],
    ["acid", "ACID"],
    ["ddl", "DDL"],
    ["dml", "DML"],
    ["dcl", "DCL"],
    ["tcl", "TCL"],
    ["er", "ER"],
    ["api", "API"],
    ["ci/cd", "CI/CD"],
    ["devops", "DevOps"],
    ["iaas", "IaaS"],
    ["paas", "PaaS"],
    ["saas", "SaaS"],
    ["aws", "AWS"],
    ["ec2", "EC2"],
    ["s3", "S3"],
    ["iam", "IAM"],
    ["cdn", "CDN"],
    ["vpc", "VPC"]
  ];

  return terms.reduce((text, [term, replacement]) => (
    text.replace(new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), replacement)
  ), String(value || ""));
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

  if (wordCount > 8 || /[.!?]/.test(normalized)) {
    return true;
  }

  if (/^(both|adjusts?|cloud providers?|gmail|docker)\b/i.test(normalized)) {
    return true;
  }

  if (/\b(based|offer|instances?|providers?|salesforce|kubernetes)\s*$/i.test(normalized)) {
    return true;
  }

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

function exportSummaryPdf({
  document: documentData,
  summary,
  length,
  summaryText,
  pdfSections,
  questions,
  pdfType = "detailed",
  generatedAt
}) {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = pdfType === "quick" ? 46 : 54;
  const contentWidth = pageWidth - margin * 2;
  const title = documentData?.title || "Study Summary";
  const generatedDate = generatedAt || summary?.updatedAt || summary?.generatedAt || new Date().toISOString();
  const pdfTypeLabel = pdfType === "quick" ? "Quick Revision PDF" : "Detailed Notes PDF";
  const sections = normalizePdfSections(pdfSections, summaryText, length)
    .filter((section) => pdfType !== "quick" || !/important questions?|q\s*&\s*a/i.test(section.title));
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

  function writeJustifiedLine(line, x, y, width) {
    const words = String(line || "").trim().split(/\s+/).filter(Boolean);

    if (words.length < 2) {
      pdf.text(line, x, y);
      return;
    }

    const wordsWidth = words.reduce((total, word) => total + pdf.getTextWidth(word), 0);
    const gapWidth = Math.max(pdf.getTextWidth(" "), (width - wordsWidth) / (words.length - 1));
    let currentX = x;

    words.forEach((word, index) => {
      pdf.text(word, currentX, y);
      currentX += pdf.getTextWidth(word);

      if (index < words.length - 1) {
        currentX += gapWidth;
      }
    });
  }

  function writeWrappedText(text, options = {}) {
    const {
      fontSize = 11,
      lineHeight = 17,
      color = [35, 45, 70],
      style = "normal",
      indent = 0,
      justify = false
    } = options;
    const textWidth = contentWidth - indent;
    const lines = pdf.splitTextToSize(String(text || ""), textWidth);

    pdf.setFont("helvetica", style);
    pdf.setFontSize(fontSize);
    pdf.setTextColor(...color);

    lines.forEach((line, index) => {
      ensureSpace(lineHeight + 2);
      const shouldJustify = justify && index < lines.length - 1;

      if (shouldJustify) {
        writeJustifiedLine(line, margin + indent, cursorY, textWidth);
      } else {
        pdf.text(line, margin + indent, cursorY);
      }

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

  function writeBullet(text) {
    const cleaned = cleanDisplaySentence(text);

    if (!cleaned) {
      return;
    }

    const cells = cleaned.split(/\s+\|\s+/).map((cell) => cell.trim()).filter(Boolean);

    if (cells.length >= 2 && cells.length <= 4) {
      writeComparisonRow(cells);
      return;
    }

    const fontSize = pdfType === "quick" ? 9.7 : 10.6;
    const lineHeight = pdfType === "quick" ? 13.5 : 16;
    const bulletIndent = 14;
    const lines = pdf.splitTextToSize(cleaned, contentWidth - bulletIndent);
    ensureSpace(lines.length * lineHeight + 5);
    pdf.setFillColor(245, 179, 1);
    pdf.circle(margin + 3, cursorY - 3, 1.8, "F");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(fontSize);
    pdf.setTextColor(35, 45, 70);
    lines.forEach((line, index) => {
      const shouldJustify = index < lines.length - 1;

      if (shouldJustify) {
        writeJustifiedLine(line, margin + bulletIndent, cursorY, contentWidth - bulletIndent);
      } else {
        pdf.text(line, margin + bulletIndent, cursorY);
      }

      cursorY += lineHeight;
    });
    cursorY += pdfType === "quick" ? 2 : 4;
  }

  function writeComparisonRow(cells) {
    const gap = 6;
    const cellWidth = (contentWidth - gap * (cells.length - 1)) / cells.length;
    const wrappedCells = cells.map((cell) => pdf.splitTextToSize(cell, cellWidth - 12));
    const rowHeight = Math.max(...wrappedCells.map((lines) => lines.length)) * 13 + 12;
    ensureSpace(rowHeight + 5);

    wrappedCells.forEach((lines, index) => {
      const x = margin + index * (cellWidth + gap);
      pdf.setFillColor(index % 2 ? 246 : 250, index % 2 ? 248 : 247, index % 2 ? 253 : 238);
      pdf.setDrawColor(219, 226, 244);
      pdf.roundedRect(x, cursorY - 10, cellWidth, rowHeight, 3, 3, "FD");
      pdf.setFont("helvetica", index === 0 ? "bold" : "normal");
      pdf.setFontSize(9.2);
      pdf.setTextColor(35, 45, 70);
      lines.forEach((line, lineIndex) => {
        pdf.text(line, x + 6, cursorY + lineIndex * 13);
      });
    });
    cursorY += rowHeight + 5;
  }

  function writeQuestionAnswer(item, index) {
    const question = cleanDisplaySentence(item?.question || item);
    const answer = cleanDisplaySentence(item?.answer || "");

    if (!question) {
      return;
    }

    ensureSpace(answer ? 92 : 54);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(92, 106, 134);
    pdf.text(`Question ${index + 1}`, margin, cursorY);
    cursorY += 16;

    writeWrappedText(question, {
      fontSize: 11,
      lineHeight: 16,
      color: [10, 45, 122],
      style: "bold"
    });
    cursorY += 8;

    if (answer) {
      ensureSpace(38);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(92, 106, 134);
      pdf.text("Answer", margin, cursorY);
      cursorY += 16;
      writeWrappedText(answer, {
        fontSize: 10.5,
        lineHeight: 16,
        color: [35, 45, 70],
        justify: true
      });
    }

    cursorY += 10;
    ensureSpace(18);
    pdf.setDrawColor(224, 229, 239);
    pdf.line(margin, cursorY, pageWidth - margin, cursorY);
    cursorY += 20;
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
    pdfTypeLabel,
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

  writeSectionTitle(pdfType === "quick" ? "Quick Revision Notes" : "Detailed Study Notes");
  sections.forEach((section) => {
    ensureSpace(42);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(pdfType === "quick" ? 11 : 12);
    pdf.setTextColor(10, 45, 122);
    pdf.text(section.title, margin, cursorY);
    cursorY += pdfType === "quick" ? 15 : 18;
    section.items.forEach(writeBullet);
    cursorY += pdfType === "quick" ? 5 : 9;
  });

  const shouldAppendQuestions = pdfType !== "quick";

  if (shouldAppendQuestions) {
    writeSectionTitle("Important Questions");
  }

  if (shouldAppendQuestions && questions?.length) {
    questions.slice(0, 10).forEach(writeQuestionAnswer);
  } else if (shouldAppendQuestions) {
    writeWrappedText("No important questions are available for this summary yet.", {
      fontSize: 11,
      lineHeight: 17,
      color: [92, 106, 134],
      justify: true
    });
  }

  addFooter();
  pdf.save(buildSummaryPdfFilename(title, pdfType));
}

function exportNotePdf(note) {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 54;
  const contentWidth = pageWidth - margin * 2;
  const bottomLimit = pageHeight - margin;
  const title = String(note?.title || "Untitled Note");
  const content = String(note?.content || "");
  let cursorY = margin;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.setTextColor(20, 20, 20);
  const titleLines = pdf.splitTextToSize(title, contentWidth);

  titleLines.forEach((line) => {
    pdf.text(line, margin, cursorY);
    cursorY += 26;
  });

  cursorY += 16;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(30, 30, 30);

  content.replace(/\r\n/g, "\n").split("\n").forEach((sourceLine) => {
    if (!sourceLine.length) {
      cursorY += 16;

      if (cursorY > bottomLimit) {
        pdf.addPage();
        cursorY = margin;
      }

      return;
    }

    const wrappedLines = pdf.splitTextToSize(sourceLine, contentWidth);

    wrappedLines.forEach((line) => {
      if (cursorY + 16 > bottomLimit) {
        pdf.addPage();
        cursorY = margin;
      }

      pdf.text(line, margin, cursorY);
      cursorY += 16;
    });
  });

  pdf.save(buildNotePdfFilename(title));
}

function normalizePdfSections(pdfSections, summaryText, length) {
  if (Array.isArray(pdfSections) && pdfSections.length) {
    return pdfSections
      .map((section, index) => ({
        title: cleanTopicTitle(section?.heading || section?.title, index, section?.items?.join(" ")),
        items: (Array.isArray(section?.items) ? section.items : [section?.text || section?.content])
          .map(cleanDisplaySentence)
          .filter(Boolean)
      }))
      .filter((section) => section.items.length);
  }

  return splitSummaryIntoSections(summaryText, length).map((section) => ({
    title: section.title,
    items: section.text
      .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9])/)
      .map(cleanDisplaySentence)
      .filter(Boolean)
  }));
}

function buildSummaryPdfFilename(title, pdfType = "detailed") {
  const safeTitle = String(title || "Summary")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  const suffix = pdfType === "quick" ? "Quick_Revision" : "Detailed_Notes";

  return `${safeTitle || "StudyMind"}_${suffix}.pdf`;
}

function buildNotePdfFilename(title) {
  const safeTitle = String(title || "Untitled Note")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");

  return `${safeTitle || "Untitled-Note"}.pdf`;
}

createRoot(document.getElementById("root")).render(<App />);
