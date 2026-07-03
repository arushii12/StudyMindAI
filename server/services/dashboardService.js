// Document counts and subject activity come from uploaded study materials.
import Document from "../models/Document.js";
// QuizAttempt powers score averages, quiz trends, and weak-topic insights.
import QuizAttempt from "../models/QuizAttempt.js";
// Flashcard records power generated-card dashboard stats.
import Flashcard from "../models/Flashcard.js";
// DailyGoal stores each user's selected study or quiz target.
import DailyGoal from "../models/DailyGoal.js";
// HiddenContinueLearningItem stores dashboard cards the user dismissed.
import HiddenContinueLearningItem from "../models/HiddenContinueLearningItem.js";
// StudyActivity stores active study minutes by day.
import StudyActivity from "../models/StudyActivity.js";
// Summary activity helps Continue Learning know which subjects have notes.
import Summary from "../models/Summary.js";
// Dashboard returns an empty state if MongoDB is unavailable.
import { isDatabaseConnected } from "../config/db.js";
// Mongoose converts string user ids for aggregation $match stages.
import mongoose from "mongoose";

// Number of milliseconds in one day, used for date ranges and streaks.
const DAY_MS = 24 * 60 * 60 * 1000;

// Called when the learner saves a daily goal.
// It validates limits and upserts one goal record for the current user.
export async function updateDailyGoalForUser(user, payload = {}) {
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Daily goals require persistence.");
    error.status = 503;
    throw error;
  }

  // Normalize goal type and keep target values inside reasonable bounds.
  const type = payload.type === "quiz" ? "quiz" : "studyTime";
  const targetMinutes = clampNumber(payload.targetMinutes, 1, 24 * 60, 60);
  const targetQuizzes = clampNumber(payload.targetQuizzes, 1, 50, 3);
  // upsert means first-time users get a goal record and returning users update theirs.
  const goal = await DailyGoal.findOneAndUpdate(
    { userId: user.id },
    {
      userId: user.id,
      type,
      targetMinutes,
      targetQuizzes
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return { goal: mapGoal(goal) };
}

// Called by the frontend activity tracker.
// It adds active study time to today's StudyActivity document.
export async function recordStudyActivityForUser(user, payload = {}) {
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Study activity requires persistence.");
    error.status = 503;
    throw error;
  }

  // Clamp duration so accidental huge timer values do not corrupt stats.
  const seconds = clampNumber(payload.durationSeconds, 1, 10 * 60, 0);
  const minutes = seconds / 60;

  if (!minutes) {
    return { activity: null };
  }

  // Source tells the dashboard which page recorded the study time.
  const source = normalizeActivitySource(payload.source);
  const dateKey = getDateKey(new Date());
  // Increment today's total and the per-source total in one MongoDB update.
  const activity = await StudyActivity.findOneAndUpdate(
    { userId: user.id, dateKey },
    {
      $inc: {
        minutes,
        [`sources.${source}`]: minutes
      },
      $set: {
        lastActivityAt: new Date()
      },
      $setOnInsert: {
        userId: user.id,
        dateKey
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return { activity: mapActivity(activity) };
}

// Called when the learner dismisses a Continue Learning card.
export async function hideContinueLearningItemForUser(user, payload = {}) {
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Continue Learning preferences require persistence.");
    error.status = 503;
    throw error;
  }

  // The subject acts as the stable key for the hidden card.
  const subject = String(payload.subject || "").replace(/\s+/g, " ").trim();

  if (!subject) {
    const error = new Error("Continue Learning item is missing.");
    error.status = 400;
    throw error;
  }

  // Save one hidden record per user and subject.
  await HiddenContinueLearningItem.findOneAndUpdate(
    { userId: user.id, subject },
    {
      userId: user.id,
      subject,
      hiddenAt: new Date()
    },
    { upsert: true, setDefaultsOnInsert: true }
  );

  return {
    hiddenSubject: subject,
    message: "Removed from Continue Learning."
  };
}

// Called when Dashboard or Profile loads.
// It combines MongoDB collections into one frontend-ready dashboard response.
export async function getDashboardData(user) {
  // Return a safe empty dashboard instead of throwing when persistence is unavailable.
  if (!user?.id || !isDatabaseConnected()) {
    return emptyDashboard(user);
  }

  const now = new Date();
  const monthStartDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const streakStartDate = new Date(now.getTime() - 365 * DAY_MS);
  streakStartDate.setUTCHours(0, 0, 0, 0);

  // Run independent dashboard queries in parallel so the page loads faster.
  const [
    documentsUploaded,
    quizSummary,
    weeklyScoreTrend,
    scoreHistory,
    studyHistory,
    dailyGoal,
    topicPerformance,
    recentAttempts,
    subjectActivity,
    summaryActivity,
    flashcardActivity,
    hiddenContinueLearningItems,
    quizActivityDays,
    studyActivityDays,
    flashcardsGenerated,
    studyTimeSummary
  ] = await Promise.all([
    // Count uploaded PDFs for the main KPI.
    countStoredPdfDocuments(user.id),
    // Aggregate total quiz attempts and average quiz score.
    QuizAttempt.aggregate([
      { $match: { userId: userObjectId(user.id) } },
      { $sort: { completedAt: 1 } },
      {
        $group: {
          _id: null,
          attempts: { $sum: 1 },
          averageScore: {
            $avg: {
              $multiply: [{ $divide: ["$score", "$totalQuestions"] }, 100]
            }
          }
        }
      }
    ]),
    // Compare current week and previous week score averages for KPI trend.
    QuizAttempt.aggregate([
      {
        $match: {
          userId: userObjectId(user.id),
          completedAt: { $gte: new Date(now.getTime() - 14 * DAY_MS) }
        }
      },
      {
        $project: {
          period: {
            $cond: [
              { $gte: ["$completedAt", new Date(now.getTime() - 7 * DAY_MS)] },
              "current",
              "previous"
            ]
          },
          percentage: {
            $multiply: [{ $divide: ["$score", "$totalQuestions"] }, 100]
          }
        }
      },
      {
        $group: {
          _id: "$period",
          averageScore: { $avg: "$percentage" },
          attempts: { $sum: 1 }
        }
      }
    ]),
    // Build daily quiz score history for this month's chart.
    QuizAttempt.aggregate([
      {
        $match: {
          userId: userObjectId(user.id),
          completedAt: { $gte: monthStartDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$completedAt" }
          },
          score: {
            $avg: {
              $multiply: [{ $divide: ["$score", "$totalQuestions"] }, 100]
            }
          },
          quizAttempts: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]),
    // Build daily study-time history for this month's chart.
    StudyActivity.aggregate([
      {
        $match: {
          userId: userObjectId(user.id),
          dateKey: { $gte: getDateKey(monthStartDate) }
        }
      },
      {
        $group: {
          _id: "$dateKey",
          studyTime: { $sum: "$minutes" }
        }
      },
      { $sort: { _id: 1 } }
    ]),
    // Load the saved daily goal for today's goal card.
    DailyGoal.findOne({ userId: user.id }).lean(),
    // Group quiz attempts by topic for insights and Continue Learning.
    QuizAttempt.aggregate([
      { $match: { userId: userObjectId(user.id) } },
      { $sort: { completedAt: 1 } },
      {
        $group: {
          _id: "$topic",
          subject: { $last: "$subject" },
          attempts: { $sum: 1 },
          averageScore: {
            $avg: {
              $multiply: [{ $divide: ["$score", "$totalQuestions"] }, 100]
            }
          },
          latestScore: {
            $last: {
              $multiply: [{ $divide: ["$score", "$totalQuestions"] }, 100]
            }
          },
          lastStudiedAt: { $max: "$completedAt" },
          totalStudyMinutes: { $sum: "$timeSpentMinutes" }
        }
      },
      { $sort: { attempts: -1, lastStudiedAt: -1 } }
    ]),
    // Recent attempts are used to detect improving topics.
    QuizAttempt.find({ userId: user.id })
      .sort({ completedAt: -1 })
      .limit(12)
      .lean(),
    // Group documents by subject so Continue Learning can show active subjects.
    Document.aggregate([
      { $match: { userId: userObjectId(user.id) } },
      { $sort: { updatedAt: 1 } },
      {
        $group: {
          _id: "$subject",
          documentId: { $last: "$_id" },
          documents: { $sum: 1 },
          readyDocuments: {
            $sum: { $cond: [{ $eq: ["$status", "ready"] }, 1, 0] }
          },
          lastOpenedAt: { $max: "$lastStudiedAt" },
          latestUploadAt: { $max: { $ifNull: ["$uploadDate", "$createdAt"] } },
          latestDocumentActivityAt: { $max: "$lastStudiedAt" }
        }
      },
      { $sort: { latestDocumentActivityAt: -1 } },
      { $limit: 12 }
    ]),
    // Group summaries by document subject for study progress.
    Summary.aggregate([
      { $match: { userId: userObjectId(user.id) } },
      {
        $lookup: {
          from: "documents",
          localField: "documentId",
          foreignField: "_id",
          as: "document"
        }
      },
      { $unwind: "$document" },
      {
        $group: {
          _id: "$document.subject",
          documentId: { $last: "$documentId" },
          summaries: { $sum: 1 },
          lastGeneratedAt: { $max: { $ifNull: ["$generatedAt", "$updatedAt"] } }
        }
      }
    ]),
    // Group generated flashcards by subject for progress cards.
    Flashcard.aggregate([
      { $match: { userId: userObjectId(user.id) } },
      {
        $group: {
          _id: "$subject",
          cards: { $sum: 1 },
          lastGeneratedAt: { $max: "$createdAt" }
        }
      }
    ]),
    // Load hidden subjects so dismissed Continue Learning cards stay hidden.
    HiddenContinueLearningItem.find({ userId: user.id }).select("subject").lean(),
    // Quiz activity days contribute to the study streak.
    QuizAttempt.aggregate([
      {
        $match: {
          userId: userObjectId(user.id),
          completedAt: { $gte: streakStartDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$completedAt" }
          }
        }
      }
    ]),
    // Study timer activity days also contribute to the study streak.
    StudyActivity.aggregate([
      {
        $match: {
          userId: userObjectId(user.id),
          dateKey: { $gte: getDateKey(streakStartDate) }
        }
      },
      {
        $group: {
          _id: "$dateKey"
        }
      }
    ]),
    // Count individual flashcards for the generated flashcards KPI.
    Flashcard.countDocuments({ userId: userObjectId(user.id) }),
    // Sum all study minutes for the lifetime study-time KPI.
    StudyActivity.aggregate([
      { $match: { userId: userObjectId(user.id) } },
      {
        $group: {
          _id: null,
          totalStudyMinutes: { $sum: "$minutes" }
        }
      }
    ])
  ]);

  // Convert aggregation results into the final response sections React renders.
  const summary = quizSummary[0] || {};
  const activityDays = [...quizActivityDays, ...studyActivityDays].map((item) => item._id);
  const studyStreak = calculateStudyStreak(activityDays);
  const chartData = buildCalendarChart(monthStartDate, now, scoreHistory, studyHistory);
  const today = chartData[chartData.length - 1] || {};
  const goal = buildGoalPayload(dailyGoal, today);

  return {
    user,
    stats: {
      documentsUploaded,
      quizAttempts: summary.attempts || 0,
      flashcardsGenerated,
      totalStudyMinutes: Math.round(studyTimeSummary[0]?.totalStudyMinutes || 0),
      averageScore: Math.round(summary.averageScore || 0),
      studyStreak,
      trends: {
        averageScore: buildAverageScoreTrend(weeklyScoreTrend),
        studyStreak: buildStudyStreakTrend(studyStreak, activityDays)
      }
    },
    progress: {
      rangeLabel: "This Month",
      chartData
    },
    goal,
    insights: buildInsights(topicPerformance, recentAttempts, studyStreak, subjectActivity, goal, documentsUploaded, chartData),
    continueLearning: buildContinueLearning(subjectActivity, summaryActivity, topicPerformance, flashcardActivity, hiddenContinueLearningItems),
    meta: {
      hasData: documentsUploaded > 0 || (summary.attempts || 0) > 0 || flashcardActivity.length > 0 || studyHistory.length > 0,
      generatedAt: new Date().toISOString()
    }
  };
}

// Convert a string id into ObjectId for aggregation pipelines.
function userObjectId(id) {
  return mongoose.Types.ObjectId.createFromHexString(id);
}

// Count stored PDFs owned by this user.
async function countStoredPdfDocuments(userId) {
  return Document.countDocuments({
    userId,
    fileType: "pdf",
    status: { $ne: "archived" }
  });
}

// Keep numeric dashboard inputs inside safe limits.
function clampNumber(value, min, max, fallback) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(number)));
}

// Format a date as YYYY-MM-DD for chart and streak keys.
function getDateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

// Keep activity source values limited to known frontend pages.
function normalizeActivitySource(source) {
  const allowedSources = new Set(["dashboard", "summary", "library", "quizzes", "flashcards", "profile"]);
  return allowedSources.has(source) ? source : "dashboard";
}

// Convert a StudyActivity document into response shape.
function mapActivity(activity) {
  return {
    id: activity._id?.toString?.(),
    date: activity.dateKey,
    minutes: Number(activity.minutes || 0),
    lastActivityAt: activity.lastActivityAt
  };
}

// Convert a DailyGoal document into response shape.
function mapGoal(goal) {
  return {
    hasGoal: Boolean(goal),
    type: goal?.type || "studyTime",
    targetMinutes: goal?.targetMinutes || 60,
    targetQuizzes: goal?.targetQuizzes || 3
  };
}

// Add today's progress values to the saved goal.
function buildGoalPayload(goal, today = {}) {
  return {
    ...mapGoal(goal),
    todayStudyMinutes: Number(today.studyTime || 0),
    todayQuizAttempts: Number(today.quizAttempts || 0)
  };
}

// Build an empty dashboard when there is no user or database connection.
function emptyDashboard(user) {
  const goal = {
    hasGoal: false,
    type: "studyTime",
    targetMinutes: 60,
    targetQuizzes: 3,
    todayStudyMinutes: 0,
    todayQuizAttempts: 0
  };

  return {
    user: user || { id: null, name: "Alex Morgan", email: "alex@studymind.ai", avatarUrl: "" },
    stats: {
      documentsUploaded: 0,
      quizAttempts: 0,
      flashcardsGenerated: 0,
      totalStudyMinutes: 0,
      averageScore: 0,
      studyStreak: 0,
      trends: {
        averageScore: buildKpiTrend(0, "%"),
        studyStreak: buildKpiTrend(0, "days")
      }
    },
    progress: {
      rangeLabel: "This Month",
      chartData: []
    },
    goal,
    insights: buildInsights([], [], 0, [], goal, 0, []),
    continueLearning: [],
    meta: {
      hasData: false,
      generatedAt: new Date().toISOString()
    }
  };
}

// Merge quiz score history and study-time history into one calendar chart.
function buildCalendarChart(startDate, endDate, scoreHistory, studyHistory) {
  const scoresByDate = new Map(
    scoreHistory.map((item) => [
      item._id,
      {
        quizScore: Math.round(item.score || 0),
        quizAttempts: item.quizAttempts || 0
      }
    ])
  );
  const studyByDate = new Map(studyHistory.map((item) => [item._id, Number(item.studyTime || 0)]));
  const days = Math.max(1, Math.floor((endDate - startDate) / DAY_MS) + 1);

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(startDate.getTime() + index * DAY_MS);
    const key = getDateKey(date);
    const values = scoresByDate.get(key) || { quizScore: null, quizAttempts: 0 };

    return {
      date: key,
      label: date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      quizScore: values.quizScore,
      studyTime: studyByDate.get(key) || 0,
      quizAttempts: values.quizAttempts
    };
  });
}

// Count consecutive active days ending today.
function calculateStudyStreak(activityDays) {
  if (!activityDays.length) {
    return 0;
  }

  const activeDays = new Set(activityDays);
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);

  let streak = 0;

  while (activeDays.has(getDateKey(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return streak;
}

// Build the three dashboard insight cards shown to the learner.
function buildInsights(topicPerformance, recentAttempts, studyStreak, subjectActivity, goal, documentsUploaded, chartData) {
  const documentSubjects = subjectActivity.map((subject) => ({
    subject: subject._id,
    documentId: subject.documentId?.toString?.(),
    documents: subject.documents || 0,
    summaries: subject.summaries || 0
  }));
  const lowest = [...topicPerformance].sort((a, b) => a.averageScore - b.averageScore)[0];
  const improving = findImprovingTopic(recentAttempts);
  const revision = topicPerformance.find((topic) => topic.averageScore < 70);
  const strongest = topicPerformance
    .filter((topic) => topic.averageScore >= 75)
    .sort((a, b) => b.averageScore - a.averageScore)[0];
  const mostStudied = [...topicPerformance].sort((a, b) => b.attempts - a.attempts)[0];
  const weekActivity = summarizeRecentActivity(chartData, 7);

  // First insight celebrates progress or gives a useful starting action.
  const positiveInsight = (() => {
    if (studyStreak > 0) {
      return {
        type: "streak",
        title: `You're on a ${studyStreak}-day streak.`,
        detail: "Keep the momentum with one quick review today.",
        href: "#flashcards"
      };
    }

    if (improving) {
      return {
        type: "improving",
        title: `${improving.topic} performance is improving.`,
        detail: `Recent score improved by ${improving.delta} percentage points.`,
        href: `#quizzes?topic=${encodeURIComponent(improving.topic)}`
      };
    }

    if (strongest) {
      return {
        type: "improving",
        title: `${strongest.subject} is your strongest subject.`,
        detail: `Average quiz accuracy is ${Math.round(strongest.averageScore)}%.`,
        href: `#quizzes?subject=${encodeURIComponent(strongest.subject)}`
      };
    }

    if (goal?.hasGoal && isGoalComplete(goal)) {
      return {
        type: "streak",
        title: "Goal achieved — keep the momentum going.",
        detail: "Great work today.",
        href: "#dashboard",
        action: "dailyGoal"
      };
    }

    if (documentsUploaded > 0) {
      return {
        type: "activity",
        title: "Nice progress building your library.",
        detail: `${documentsUploaded} document${documentsUploaded === 1 ? "" : "s"} currently stored.`,
        href: "#library"
      };
    }

    return {
      type: "streak",
      title: "Set up today's study plan.",
      detail: "Add a daily goal or upload notes to start tracking progress.",
      href: "#dashboard",
      action: "dailyGoal"
    };
  })();

  // Second insight points the learner toward revision or practice.
  const revisionInsight = (() => {
    if (revision) {
      return {
        type: "revision",
        title: `${revision._id} needs revision.`,
        detail: `Average accuracy is ${Math.round(revision.averageScore)}% across ${revision.attempts} attempts.`,
        href: `#quizzes?subject=${encodeURIComponent(revision.subject || revision._id)}`
      };
    }

    if (lowest) {
      return {
        type: "focus",
        title: `${lowest._id} is your lowest scoring topic.`,
        detail: `Current average is ${Math.round(lowest.averageScore)}%.`,
        href: `#quizzes?subject=${encodeURIComponent(lowest.subject || lowest._id)}`
      };
    }

    const reviewSubject = documentSubjects.find((subject) => subject.summaries > 0) || documentSubjects[0];

    if (reviewSubject) {
      return {
        type: "focus",
        title: `${reviewSubject.subject} is ready for review.`,
        detail: "Open your summary or try a short quiz.",
        href: reviewSubject.documentId
          ? `#summary?documentId=${reviewSubject.documentId}`
          : `#summary?subject=${encodeURIComponent(reviewSubject.subject)}`
      };
    }

    return {
      type: "revision",
      title: "No quiz attempts yet.",
      detail: "Complete a quiz to reveal revision priorities.",
      href: "#quizzes"
    };
  })();

  // Third insight focuses on goal progress or recent activity.
  const activityInsight = buildGoalInsight(goal) || (() => {
    if (weekActivity.quizAttempts > 0) {
      return {
        type: "activity",
        title: `You completed ${weekActivity.quizAttempts} quiz${weekActivity.quizAttempts === 1 ? "" : "zes"} this week.`,
        detail: "Keep using practice questions to check retention.",
        href: "#quizzes"
      };
    }

    if (weekActivity.studyMinutes > 0) {
      return {
        type: "activity",
        title: `${Math.round(weekActivity.studyMinutes)} study minutes logged this week.`,
        detail: "A little consistency compounds quickly.",
        href: "#dashboard"
      };
    }

    if (mostStudied) {
      return {
        type: "activity",
        title: `${mostStudied.subject} is your most studied subject.`,
        detail: `${mostStudied.attempts} quiz attempt${mostStudied.attempts === 1 ? "" : "s"} logged so far.`,
        href: `#summary?subject=${encodeURIComponent(mostStudied.subject)}`
      };
    }

    return {
      type: "activity",
      title: "Set a daily goal to track your study progress.",
      detail: "Choose a study or quiz target to stay on track.",
      href: "#dashboard",
      action: "dailyGoal"
    };
  })();

  return [positiveInsight, revisionInsight, activityInsight].slice(0, 3);
}

// Build the insight that explains today's goal progress.
function buildGoalInsight(goal) {
  if (!goal?.hasGoal) {
    return {
      type: "activity",
      title: "Set a daily goal to track your study progress.",
      detail: "Choose a study or quiz target to stay on track.",
      href: "#dashboard",
      action: "dailyGoal"
    };
  }

  if (goal.type === "quiz") {
    const target = Number(goal.targetQuizzes || 0);
    const completed = Number(goal.todayQuizAttempts || 0);
    const remaining = Math.max(0, target - completed);

    if (remaining === 0) {
      return {
        type: "activity",
        title: "Daily goal completed.",
        detail: "You reached today's quiz target.",
        href: "#dashboard",
        action: "dailyGoal"
      };
    }

    return {
      type: "activity",
      title: `Only ${remaining} more quiz${remaining === 1 ? "" : "zes"} needed to complete today's goal.`,
      detail: `You're ${goalPercent(completed, target)}% of the way to today's quiz target.`,
      href: "#dashboard",
      action: "dailyGoal"
    };
  }

  const target = Number(goal.targetMinutes || 0);
  const completed = Number(goal.todayStudyMinutes || 0);
  const remaining = Math.max(0, Math.ceil(target - completed));

  if (remaining === 0) {
    return {
      type: "activity",
      title: "Daily goal completed.",
      detail: "You reached today's study target.",
      href: "#dashboard",
      action: "dailyGoal"
    };
  }

  return {
    type: "activity",
    title: `Only ${remaining} more minute${remaining === 1 ? "" : "s"} to reach today's goal.`,
    detail: `You're ${goalPercent(completed, target)}% of the way to today's study goal.`,
    href: "#dashboard",
    action: "dailyGoal"
  };
}

// Check whether today's saved goal is complete.
function isGoalComplete(goal) {
  if (!goal?.hasGoal) {
    return false;
  }

  if (goal.type === "quiz") {
    return Number(goal.todayQuizAttempts || 0) >= Number(goal.targetQuizzes || 0);
  }

  return Number(goal.todayStudyMinutes || 0) >= Number(goal.targetMinutes || 0);
}

// Convert completed work into a goal percentage.
function goalPercent(completed, target) {
  if (!target) {
    return 0;
  }

  return Math.min(100, Math.round((Number(completed || 0) / Number(target)) * 100));
}

// Sum recent chart entries to describe this week's activity.
function summarizeRecentActivity(chartData = [], days = 7) {
  return chartData.slice(-days).reduce(
    (totals, item) => ({
      quizAttempts: totals.quizAttempts + Number(item.quizAttempts || 0),
      studyMinutes: totals.studyMinutes + Number(item.studyTime || 0)
    }),
    { quizAttempts: 0, studyMinutes: 0 }
  );
}

// Find a topic whose recent scores improved.
function findImprovingTopic(attempts) {
  const byTopic = new Map();

  attempts
    .slice()
    .reverse()
    .forEach((attempt) => {
      const score = Math.round((attempt.score / attempt.totalQuestions) * 100);
      const history = byTopic.get(attempt.topic) || [];
      history.push(score);
      byTopic.set(attempt.topic, history);
    });

  let best = null;

  byTopic.forEach((history, topic) => {
    if (history.length < 2) {
      return;
    }

    const delta = history[history.length - 1] - history[0];

    if (delta > 0 && (!best || delta > best.delta)) {
      const source = attempts.find((attempt) => attempt.topic === topic);
      best = { topic, subject: source?.subject, delta };
    }
  });

  return best;
}

// Build Continue Learning cards by merging document, summary, quiz, and flashcard activity.
function buildContinueLearning(subjectActivity, summaryActivity, topicPerformance, flashcardActivity, hiddenItems = []) {
  const cardsBySubject = new Map();
  const hiddenSubjects = new Set(hiddenItems.map((item) => item.subject));

  // Start cards from uploaded document activity.
  subjectActivity.forEach((subject) => {
    cardsBySubject.set(subject._id, {
      documentId: subject.documentId?.toString?.(),
      subject: subject._id,
      documents: subject.documents || 0,
      summaries: 0,
      flashcardsGenerated: 0,
      quizAttempts: 0,
      progress: 0,
      lastActivityAt: subject.latestDocumentActivityAt,
      lastOpenedAt: subject.lastOpenedAt,
      lastUploadedAt: subject.latestUploadAt,
      detail: `${subject.documents} document${subject.documents === 1 ? "" : "s"} uploaded`,
      status: "Not studied yet"
    });
  });

  // Merge summary completion into the same subject cards.
  summaryActivity.forEach((subject) => {
    const existing = cardsBySubject.get(subject._id) || {
      documentId: subject.documentId?.toString?.(),
      subject: subject._id,
      documents: 0,
      progress: 0,
      detail: "Summary ready",
      status: "Summary completed"
    };

    existing.documentId = existing.documentId || subject.documentId?.toString?.();
    existing.summaries = subject.summaries || 0;
    existing.lastSummaryGeneratedAt = subject.lastGeneratedAt;
    existing.lastActivityAt = latestDate(existing.lastActivityAt, subject.lastGeneratedAt);
    existing.status = "Summary completed";
    cardsBySubject.set(subject._id, existing);
  });

  // Merge generated flashcard activity into subject cards.
  flashcardActivity.forEach((subject) => {
    const existing = cardsBySubject.get(subject._id) || {
      subject: subject._id,
      progress: 0,
      lastActivityAt: subject.lastGeneratedAt,
      detail: "Flashcards ready",
      status: "Flashcards ready"
    };

    existing.flashcards = subject.cards || 0;
    existing.flashcardsGenerated = subject.cards || 0;
    existing.lastFlashcardsGeneratedAt = subject.lastGeneratedAt;
    existing.lastActivityAt = latestDate(existing.lastActivityAt, subject.lastGeneratedAt);
    existing.status = subject.cards > 0 ? "Flashcards ready" : existing.status || "Flashcards ready";
    cardsBySubject.set(subject._id, existing);
  });

  // Merge quiz attempts and latest scores into subject cards.
  topicPerformance.forEach((topic) => {
    const existing = cardsBySubject.get(topic.subject) || {
      subject: topic.subject,
      progress: 0,
      lastActivityAt: topic.lastStudiedAt,
      detail: `${topic.attempts} quiz attempt${topic.attempts === 1 ? "" : "s"}`,
      status: "Quiz attempted"
    };

    existing.quizAttempts = topic.attempts || 0;
    existing.lastQuizAttemptAt = topic.lastStudiedAt;
    existing.lastActivityAt = latestDate(existing.lastActivityAt, topic.lastStudiedAt);
    existing.lastScore = Math.round(topic.latestScore || topic.averageScore || 0);
    existing.status = "Quiz attempted";
    cardsBySubject.set(topic.subject, existing);
  });

  // Sort by most recent activity and return only visible cards.
  return [...cardsBySubject.values()]
    .filter((item) => !hiddenSubjects.has(item.subject))
    .filter((item) => item.lastActivityAt)
    .sort((a, b) => {
      return new Date(b.lastActivityAt || 0) - new Date(a.lastActivityAt || 0);
    })
    .slice(0, 3)
    .map((item) => {
      const progress = calculateActionProgress(item);
      const status = progressStatus(item);

      return {
        subject: item.subject,
        progress,
        lastStudied: formatRelativeDate(item.lastActivityAt),
        detail: progress === 0 ? "0% complete" : item.detail,
        status,
        lastScore: Number.isFinite(item.lastScore) ? item.lastScore : null,
        primaryActionLabel: progress >= 100 ? "Revise Again" : "Continue",
        summaryHref: item.documentId ? `#summary?documentId=${item.documentId}` : `#summary?subject=${encodeURIComponent(item.subject)}`,
        quizHref: item.documentId ? `#quizzes?documentId=${item.documentId}` : `#quizzes?subject=${encodeURIComponent(item.subject)}`
      };
    });
}

// Build the average-score KPI trend compared with the previous week.
function buildAverageScoreTrend(weeklyScoreTrend) {
  const current = weeklyScoreTrend.find((item) => item._id === "current")?.averageScore || 0;
  const previous = weeklyScoreTrend.find((item) => item._id === "previous")?.averageScore || 0;
  const delta = Math.round(current - previous);

  return buildKpiTrend(delta, "%");
}

// Build the study-streak KPI trend compared with last week's active days.
function buildStudyStreakTrend(currentStreak, activityDays) {
  const activeDays = new Set(activityDays);
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  cursor.setUTCDate(cursor.getUTCDate() - 7);

  let previousWeekActiveDays = 0;

  for (let index = 0; index < 7; index += 1) {
    if (activeDays.has(getDateKey(cursor))) {
      previousWeekActiveDays += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  const delta = currentStreak - previousWeekActiveDays;

  return buildKpiTrend(delta, "days");
}

// Convert a numeric delta into the small trend object used by KPI cards.
function buildKpiTrend(delta, unit = "") {
  const value = Number(delta || 0);

  if (value === 0) {
    return {
      direction: "flat",
      value,
      label: "Same as last week"
    };
  }

  const absoluteValue = Math.abs(value);
  const normalizedUnit = unit === "days" && absoluteValue === 1 ? "day" : unit;
  const suffix = normalizedUnit === "%" ? "%" : ` ${normalizedUnit}`.trimEnd();

  return {
    direction: value > 0 ? "up" : "down",
    value,
    label: `${value > 0 ? "+" : ""}${absoluteValue}${suffix} from last week`
  };
}

// Estimate how much of a subject's study flow is complete.
function calculateActionProgress(subject) {
  const availableActions = [
    subject.documents > 0 || subject.summaries > 0,
    subject.flashcards > 0 || subject.documents > 0,
    subject.quizAttempts > 0 || subject.documents > 0
  ].filter(Boolean).length;

  if (!availableActions) {
    return 0;
  }

  const completedActions = [
    subject.summaries > 0,
    subject.flashcardsGenerated > 0,
    subject.quizAttempts > 0
  ].filter(Boolean).length;

  return Math.round((completedActions / availableActions) * 100);
}

// Build the short status text shown on Continue Learning cards.
function progressStatus(subject) {
  if (subject.quizAttempts > 0) {
    if (subject.summaries > 0) {
      return "Summary completed and quiz attempted";
    }

    return "Quiz attempted";
  }

  if (subject.flashcardsGenerated > 0) {
    return "Flashcards ready";
  }

  if (subject.summaries > 0) {
    return "Summary completed";
  }

  return "Not studied yet";
}

// Return whichever of two dates is latest.
function latestDate(left, right) {
  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  return new Date(left) > new Date(right) ? left : right;
}

// Convert a date into text like "Last studied: today".
function formatRelativeDate(date) {
  if (!date) {
    return "Not studied yet";
  }

  const diff = Date.now() - new Date(date).getTime();
  const days = Math.max(0, Math.floor(diff / DAY_MS));

  if (days === 0) {
    return "Last studied: today";
  }

  if (days === 1) {
    return "Last studied: 1 day ago";
  }

  return `Last studied: ${days} days ago`;
}
