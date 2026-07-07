import React, { useEffect, useMemo, useState } from "react";
import { BookOpen, Brain, Clock3, LineChart, Sparkles, Target, X } from "lucide-react";
import { useAutoDismissStatus } from "../utils/hooks.js";
import { GoalDropdown } from "../components/GoalDropdown.jsx";
import { LoadingBanner } from "../components/Loading.jsx";
import ConfirmationModal from "../components/ConfirmationModal.jsx";
import { EmptyDataBanner, EmptyPanel } from "../components/States.jsx";

const insightIcons = {
  revision: Target,
  focus: Brain,
  activity: Clock3,
  improving: LineChart
};

// Main dashboard content made from backend stats, progress, and recommendations.
export default function DashboardContent({ dashboard, liveStudySeconds = 0, statConfig }) {
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

// Shows one dashboard metric card.
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

// Converts numeric trend data into display text and styling.
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

// Lets the user choose and save a daily study goal.
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

  // Keeps local goal controls synced with backend goal updates.
  useEffect(() => {
    setGoalState(normalizeGoal(goal));
  }, [goal]);

  // Saves the selected goal type and target to the dashboard API.
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

// Normalizes backend goal data before rendering the goal widget.
function normalizeGoal(goal) {
  return {
    type: goal?.type === "quiz" ? "quiz" : "studyTime",
    targetMinutes: clamp(goal?.targetMinutes, 30, 12 * 60, 60),
    targetQuizzes: clamp(goal?.targetQuizzes, 1, 20, 3),
    todayStudyMinutes: Number(goal?.todayStudyMinutes || 0),
    todayQuizAttempts: Number(goal?.todayQuizAttempts || 0)
  };
}

// Keeps numeric settings inside the allowed range.
function clamp(value, min, max, fallback) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(number)));
}

// Formats goal minutes as a compact hour/minute label.
function formatGoalHours(minutes) {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  return `${formatHours(minutes / 60)} hrs`;
}

// Shows study time or quiz score progress over a selected period.
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

// Filters chart data to this week or this month.
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

// Finds Monday of the current week for dashboard filtering.
function startOfCurrentWeek(date) {
  const start = new Date(date);
  const day = start.getDay();
  const daysSinceMonday = (day + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);
  return start;
}

// Empty chart state used before enough activity exists.
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

// Small metric card under the progress chart.
function ProgressMetricCard({ label, value }) {
  return (
    <article className="progress-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

// Renders the progress chart SVG for study time or quiz scores.
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

// Converts dashboard progress data into chart points, labels, and path data.
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

// Builds a smooth SVG path through chart points.
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

// Calculates totals and averages for the selected progress metric.
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

// Formats decimal hours to one place for dashboard labels.
function formatHours(value) {
  return Number(value || 0).toFixed(1);
}

// Shows actionable dashboard insights.
function InsightsCard({ insights }) {
  // Scrolls to the daily goal widget when that insight is clicked.
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

// Shows recent study items and lets users hide them from the dashboard.
function ContinueLearning({ items }) {
  const [visibleItems, setVisibleItems] = useState(items.slice(0, 3));
  const [pendingRemoveItem, setPendingRemoveItem] = useState(null);
  const [removeState, setRemoveState] = useState({
    status: "idle",
    message: ""
  });
  useAutoDismissStatus(removeState, setRemoveState);

  // Refreshes the visible cards whenever dashboard data changes.
  useEffect(() => {
    setVisibleItems(items.slice(0, 3));
  }, [items]);

  // Hides one continue-learning item without deleting study data.
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
