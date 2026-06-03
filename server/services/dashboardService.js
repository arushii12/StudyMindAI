import Document from "../models/Document.js";
import QuizAttempt from "../models/QuizAttempt.js";
import Flashcard from "../models/Flashcard.js";
import DailyGoal from "../models/DailyGoal.js";
import StudyActivity from "../models/StudyActivity.js";
import { isDatabaseConnected } from "../config/db.js";
import mongoose from "mongoose";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function updateDailyGoalForUser(user, payload = {}) {
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Daily goals require persistence.");
    error.status = 503;
    throw error;
  }

  const type = payload.type === "quiz" ? "quiz" : "studyTime";
  const targetMinutes = clampNumber(payload.targetMinutes, 1, 24 * 60, 60);
  const targetQuizzes = clampNumber(payload.targetQuizzes, 1, 50, 3);
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

export async function recordStudyActivityForUser(user, payload = {}) {
  if (!user?.id || !isDatabaseConnected()) {
    const error = new Error("MongoDB is not connected. Study activity requires persistence.");
    error.status = 503;
    throw error;
  }

  const seconds = clampNumber(payload.durationSeconds, 1, 10 * 60, 0);
  const minutes = seconds / 60;

  if (!minutes) {
    return { activity: null };
  }

  const source = normalizeActivitySource(payload.source);
  const dateKey = getDateKey(new Date());
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

export async function getDashboardData(user) {
  if (!user?.id || !isDatabaseConnected()) {
    return emptyDashboard(user);
  }

  const now = new Date();
  const monthStartDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const streakStartDate = new Date(now.getTime() - 365 * DAY_MS);
  streakStartDate.setUTCHours(0, 0, 0, 0);

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
    flashcardActivity,
    quizActivityDays,
    studyActivityDays
  ] = await Promise.all([
    Document.countDocuments({ userId: user.id }),
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
    DailyGoal.findOne({ userId: user.id }).lean(),
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
    QuizAttempt.find({ userId: user.id })
      .sort({ completedAt: -1 })
      .limit(12)
      .lean(),
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
          summaries: {
            $sum: { $cond: ["$summaryGenerated", 1, 0] }
          },
          lastStudiedAt: { $max: { $literal: null } },
          latestUploadAt: { $max: { $ifNull: ["$uploadDate", "$createdAt"] } }
        }
      },
      { $sort: { lastStudiedAt: -1, latestUploadAt: -1 } },
      { $limit: 8 }
    ]),
    Flashcard.aggregate([
      { $match: { userId: userObjectId(user.id) } },
      {
        $group: {
          _id: "$subject",
          cards: { $sum: 1 },
          mastered: {
            $sum: { $cond: ["$mastered", 1, 0] }
          },
          reviewed: {
            $sum: { $cond: [{ $ne: ["$reviewedAt", null] }, 1, 0] }
          },
          lastReviewedAt: { $max: "$reviewedAt" }
        }
      }
    ]),
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
    ])
  ]);

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
    insights: buildInsights(topicPerformance, recentAttempts, studyStreak, subjectActivity),
    continueLearning: buildContinueLearning(subjectActivity, topicPerformance, flashcardActivity),
    meta: {
      hasData: documentsUploaded > 0 || (summary.attempts || 0) > 0 || flashcardActivity.length > 0 || studyHistory.length > 0,
      generatedAt: new Date().toISOString()
    }
  };
}

function userObjectId(id) {
  return mongoose.Types.ObjectId.createFromHexString(id);
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(number)));
}

function getDateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function normalizeActivitySource(source) {
  const allowedSources = new Set(["dashboard", "summary", "library", "quizzes", "flashcards", "analytics"]);
  return allowedSources.has(source) ? source : "dashboard";
}

function mapActivity(activity) {
  return {
    id: activity._id?.toString?.(),
    date: activity.dateKey,
    minutes: Number(activity.minutes || 0),
    lastActivityAt: activity.lastActivityAt
  };
}

function mapGoal(goal) {
  return {
    type: goal?.type || "studyTime",
    targetMinutes: goal?.targetMinutes || 60,
    targetQuizzes: goal?.targetQuizzes || 3
  };
}

function buildGoalPayload(goal, today = {}) {
  return {
    ...mapGoal(goal),
    todayStudyMinutes: Number(today.studyTime || 0),
    todayQuizAttempts: Number(today.quizAttempts || 0)
  };
}

function emptyDashboard(user) {
  return {
    user: user || { id: null, name: "Alex Morgan", email: "alex@studymind.ai", avatarUrl: "" },
    stats: {
      documentsUploaded: 0,
      quizAttempts: 0,
      averageScore: 0,
      studyStreak: 0,
      trends: {
        averageScore: { direction: "up", label: "+0% from last week", value: 0 },
        studyStreak: { direction: "up", label: "+0 days from last week", value: 0 }
      }
    },
    progress: {
      rangeLabel: "This Month",
      chartData: []
    },
    goal: {
      type: "studyTime",
      targetMinutes: 60,
      targetQuizzes: 3,
      todayStudyMinutes: 0,
      todayQuizAttempts: 0
    },
    insights: [],
    continueLearning: [],
    meta: {
      hasData: false,
      generatedAt: new Date().toISOString()
    }
  };
}

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

function buildInsights(topicPerformance, recentAttempts, studyStreak, subjectActivity) {
  const insights = [];
  const usedSubjects = new Set();
  const documentSubjects = subjectActivity.map((subject) => ({
    subject: subject._id,
    documentId: subject.documentId?.toString?.(),
    lastStudiedAt: subject.lastStudiedAt
  }));
  const lowest = [...topicPerformance].sort((a, b) => a.averageScore - b.averageScore)[0];
  const improving = findImprovingTopic(recentAttempts);
  const revision = topicPerformance.find((topic) => topic.averageScore < 70);
  const strongest = topicPerformance
    .filter((topic) => topic.averageScore >= 75)
    .sort((a, b) => b.averageScore - a.averageScore)[0];
  const mostStudied = [...topicPerformance].sort((a, b) => b.attempts - a.attempts)[0];
  const inactive = [...documentSubjects]
    .filter((subject) => daysSince(subject.lastStudiedAt) >= 3)
    .sort((a, b) => daysSince(b.lastStudiedAt) - daysSince(a.lastStudiedAt))[0];

  function addInsight(insight, subject) {
    if (insights.length >= 3) {
      return;
    }

    if (subject && usedSubjects.has(subject)) {
      return;
    }

    insights.push(insight);

    if (subject) {
      usedSubjects.add(subject);
    }
  }

  if (studyStreak > 0) {
    addInsight({
      type: "streak",
      title: `You're on a ${studyStreak}-day streak.`,
      detail: "Keep the momentum with one quick review today.",
      href: "#flashcards"
    });
  }

  if (revision) {
    addInsight({
      type: "revision",
      title: `${revision._id} needs revision.`,
      detail: `Average accuracy is ${Math.round(revision.averageScore)}% across ${revision.attempts} attempts.`,
      href: `#quizzes?subject=${encodeURIComponent(revision.subject || revision._id)}`
    }, revision.subject || revision._id);
  } else if (lowest) {
    addInsight({
      type: "focus",
      title: `${lowest._id} is your lowest scoring topic.`,
      detail: `Current average is ${Math.round(lowest.averageScore)}%.`,
      href: `#quizzes?subject=${encodeURIComponent(lowest.subject || lowest._id)}`
    }, lowest.subject || lowest._id);
  }

  if (improving) {
    addInsight({
      type: "improving",
      title: `${improving.topic} performance is improving.`,
      detail: `Recent score improved by ${improving.delta} percentage points.`,
      href: `#quizzes?topic=${encodeURIComponent(improving.topic)}`
    }, improving.subject || improving.topic);
  }

  if (strongest) {
    addInsight({
      type: "improving",
      title: `${strongest.subject} is your strongest subject.`,
      detail: `Average quiz accuracy is ${Math.round(strongest.averageScore)}%.`,
      href: `#quizzes?subject=${encodeURIComponent(strongest.subject)}`
    }, strongest.subject);
  }

  if (!insights.some((insight) => ["streak", "improving"].includes(insight.type)) && (topicPerformance.length || documentSubjects.length)) {
    addInsight({
      type: "activity",
      title: "Your study history is building.",
      detail: "Keep adding quiz attempts to sharpen these insights.",
      href: "#dashboard"
    });
  }

  if (inactive) {
    const inactiveDays = daysSince(inactive.lastStudiedAt);
    addInsight({
      type: "focus",
      title: `${inactive.subject} has not been reviewed in ${inactiveDays} days.`,
      detail: "Open the material for a quick refresh.",
      href: inactive.documentId
        ? `#summary?documentId=${inactive.documentId}`
        : `#summary?subject=${encodeURIComponent(inactive.subject)}`
    }, inactive.subject);
  }

  if (mostStudied) {
    addInsight({
      type: "activity",
      title: `${mostStudied.subject} is your most studied subject.`,
      detail: `${mostStudied.attempts} quiz attempt${mostStudied.attempts === 1 ? "" : "s"} logged so far.`,
      href: `#summary?subject=${encodeURIComponent(mostStudied.subject)}`
    }, mostStudied.subject);
  }

  documentSubjects.forEach((item) => {
    addInsight({
      type: "focus",
      title: `${item.subject} is ready for review.`,
      detail: "Open your summary or try a short quiz.",
      href: item.documentId
        ? `#summary?documentId=${item.documentId}`
        : `#summary?subject=${encodeURIComponent(item.subject)}`
    }, item.subject);
  });

  if (!insights.length) {
    addInsight({
      type: "streak",
      title: "Start a 1-day streak today.",
      detail: "Upload notes or review flashcards to begin.",
      href: "#summary"
    });
    addInsight({
      type: "focus",
      title: "Generate a quiz from your notes.",
      detail: "Quiz history will unlock sharper insights.",
      href: "#quizzes"
    });
    addInsight({
      type: "activity",
      title: "Review flashcards for quick recall.",
      detail: "A short deck helps build daily consistency.",
      href: "#flashcards"
    });
  }

  return insights.slice(0, 3);
}

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

function daysSince(date) {
  if (!date) {
    return 999;
  }

  return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / DAY_MS));
}

function buildContinueLearning(subjectActivity, topicPerformance, flashcardActivity) {
  const cardsBySubject = new Map();

  subjectActivity.forEach((subject) => {
    cardsBySubject.set(subject._id, {
      documentId: subject.documentId?.toString?.(),
      subject: subject._id,
      documents: subject.documents || 0,
      summaries: subject.summaries || 0,
      flashcardsReviewed: 0,
      quizAttempts: 0,
      progress: 0,
      lastStudiedAt: subject.lastStudiedAt,
      detail: `${subject.documents} document${subject.documents === 1 ? "" : "s"} uploaded`,
      status: subject.summaries > 0 ? "Summary complete" : "Not Started"
    });
  });

  flashcardActivity.forEach((subject) => {
    const existing = cardsBySubject.get(subject._id) || {
      subject: subject._id,
      progress: 0,
      lastStudiedAt: subject.lastReviewedAt,
      detail: "Flashcards ready",
      status: "Flashcards reviewed"
    };

    existing.flashcards = subject.cards || 0;
    existing.flashcardsReviewed = subject.reviewed || 0;
    existing.lastStudiedAt = latestDate(existing.lastStudiedAt, subject.lastReviewedAt);
    existing.status = subject.reviewed > 0 ? "Flashcards reviewed" : existing.status || "Flashcards ready";
    cardsBySubject.set(subject._id, existing);
  });

  topicPerformance.forEach((topic) => {
    const existing = cardsBySubject.get(topic.subject) || {
      subject: topic.subject,
      progress: 0,
      lastStudiedAt: topic.lastStudiedAt,
      detail: `${topic.attempts} quiz attempt${topic.attempts === 1 ? "" : "s"}`,
      status: "Quiz progress"
    };

    existing.quizAttempts = topic.attempts || 0;
    existing.lastStudiedAt = latestDate(existing.lastStudiedAt, topic.lastStudiedAt);
    existing.lastScore = Math.round(topic.latestScore || topic.averageScore || 0);
    existing.status = "Quiz progress";
    cardsBySubject.set(topic.subject, existing);
  });

  return [...cardsBySubject.values()]
    .sort((a, b) => {
      const unfinished = Number(calculateActionProgress(a) >= 100) - Number(calculateActionProgress(b) >= 100);
      if (unfinished !== 0) {
        return unfinished;
      }

      return new Date(b.lastStudiedAt || 0) - new Date(a.lastStudiedAt || 0);
    })
    .slice(0, 3)
    .map((item) => {
      const progress = calculateActionProgress(item);

      return {
        subject: item.subject,
        progress,
        lastStudied: formatRelativeDate(item.lastStudiedAt),
        detail: item.detail,
        status: item.status || progressStatus(item),
        lastScore: Number.isFinite(item.lastScore) ? item.lastScore : null,
        primaryActionLabel: progress >= 100 ? "Revise Again" : "Continue",
        summaryHref: item.documentId ? `#summary?documentId=${item.documentId}` : `#summary?subject=${encodeURIComponent(item.subject)}`,
        quizHref: item.documentId ? `#quizzes?documentId=${item.documentId}` : `#quizzes?subject=${encodeURIComponent(item.subject)}`
      };
    });
}

function buildAverageScoreTrend(weeklyScoreTrend) {
  const current = weeklyScoreTrend.find((item) => item._id === "current")?.averageScore || 0;
  const previous = weeklyScoreTrend.find((item) => item._id === "previous")?.averageScore || 0;
  const delta = Math.round(current - previous);

  return {
    direction: delta >= 0 ? "up" : "down",
    value: delta,
    label: `${delta >= 0 ? "+" : ""}${delta}% from last week`
  };
}

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
  const dayLabel = Math.abs(delta) === 1 ? "day" : "days";

  return {
    direction: delta >= 0 ? "up" : "down",
    value: delta,
    label: `${delta >= 0 ? "+" : ""}${delta} ${dayLabel} from last week`
  };
}

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
    subject.flashcardsReviewed > 0,
    subject.quizAttempts > 0
  ].filter(Boolean).length;

  return Math.round((completedActions / availableActions) * 100);
}

function progressStatus(subject) {
  if (subject.quizAttempts > 0) {
    return "Quiz progress";
  }

  if (subject.flashcardsReviewed > 0) {
    return "Flashcards reviewed";
  }

  if (subject.summaries > 0) {
    return "Summary complete";
  }

  return "Not Started";
}

function latestDate(left, right) {
  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  return new Date(left) > new Date(right) ? left : right;
}

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
