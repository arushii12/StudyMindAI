import { jsPDF } from "jspdf";

const QUIZ_INSIGHT_FALLBACK = "We couldn't generate an AI insight for this attempt. Review the incorrect and unanswered questions below, then retake the quiz after revising the summary.";

// Formats dates for document upload and summary metadata.
export function formatDate(date) {
  if (!date) {
    return "2 Jun 2024";
  }

  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

// Formats completed quiz timestamps.
export function formatDateTime(date) {
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

// Formats quiz attempt duration.
export function formatDuration(seconds) {
  const totalSeconds = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  if (minutes <= 0) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

// Chooses a score band used by quiz result styling.
export function getScoreBand(score) {
  const value = Number(score || 0);

  if (value < 40) {
    return "low";
  }

  if (value < 70) {
    return "mid";
  }

  return "high";
}

// Formats recent activity labels like updated just now.
export function formatRelativeTimestamp(date) {
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

// Formats uploaded document types for display.
export function formatFileType(fileType) {
  return (fileType || "PDF").toUpperCase();
}

// Formats file sizes in KB or MB for Library tables.
export function formatFileSize(bytes) {
  const value = Number(bytes || 0);

  if (!value) {
    return "—";
  }

  if (value < 1024 * 1024) {
    return `${Math.max(1, Math.round(value / 1024))} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}

// Cleans PDF display names before showing or saving them.
export function normalizeDisplayFileName(value) {
  return String(value || "")
    .replace(/\.pdf$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Builds the localStorage key for one quiz result.
export function quizResultStorageKey(quizId) {
  return `studymind:quiz-result:${quizId}`;
}

// Stores submitted quiz results so the review page can open instantly.
export function saveQuizResult(result) {
  try {
    localStorage.setItem(quizResultStorageKey(result.quizId), JSON.stringify(result));
  } catch {
    // Result navigation still works in-memory during the current page lifecycle.
  }
}

// Reads a submitted quiz result from localStorage.
export function readQuizResult(quizId) {
  try {
    const raw = localStorage.getItem(quizResultStorageKey(quizId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Rebuilds selected answer state from a stored quiz result.
export function buildAnswersFromResult(result) {
  return (result?.answers || []).reduce((mapped, answer) => {
    if (Number.isInteger(answer.selectedAnswer)) {
      mapped[answer.questionNumber - 1] = answer.selectedAnswer;
    }

    return mapped;
  }, {});
}

// Converts a submitted attempt into the result page data shape.
export function buildQuizResultPayload({ quizData, answers, attempt, timeTakenSeconds }) {
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

// Builds the compact payload sent to the quiz insight endpoint.
export function buildQuizInsightRequest(result) {
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

// Provides a fallback quiz insight if the AI insight request fails.
export function buildQuizInsight({ scorePercentage, correctCount, incorrectCount, unansweredCount, totalQuestions }) {
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

// Combines saved-summary and marked-question groups into Review Center folder cards.
export function buildReviewFolderCards(summaryGroups, questionGroups) {
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

// Finds the saved items for one Review Center folder.
export function findReviewGroup(groups, folderKey, itemKey) {
  const group = groups.find((item) => (item.folderId || "uncategorized") === folderKey);
  return group?.[itemKey] || [];
}

// Formats a selected quiz option for result review.
export function formatQuizAnswer(options = [], index) {
  if (!Number.isInteger(index) || index < 0 || index >= options.length) {
    return "Not answered";
  }

  return `${String.fromCharCode(65 + index)}. ${options[index]}`;
}

// Capitalizes short labels used in tabs and badges.
export function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// Splits raw summary text into titled sections for display.
export function splitSummaryIntoSections(text, length) {
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

// Reads AI output that already uses heading: paragraph structure.
export function parseTopicSections(text) {
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

// Cleans one summary sentence before showing it in a card or PDF.
export function cleanDisplaySentence(sentence) {
  return stripMarkdownArtifacts(sentence)
    .replace(/[•●○▪▫]/g, "")
    .replace(/^\s*[-–—:;,.]+/, "")
    .replace(/^\s*\d+[\).:-]\s*/, "")
    .replace(/\s+\d+[\).]\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Builds a useful section title from the section text.
export function buildTopicTitle(text, index) {
  const cleaned = cleanDisplaySentence(text);
  const rawTitle = findBestTopicPhrase(cleaned);

  return cleanTopicTitle(rawTitle, index, cleaned);
}

// Cleans AI headings and falls back when the heading is vague.
export function cleanTopicTitle(title, index = 0, sectionText = "") {
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

// Builds final summary sections for short, medium, or detailed display.
export function buildSummaryDisplaySections(text, length) {
  if (length === "detailed") {
    return buildDetailedSummaryDisplaySections(text);
  }

  const sections = splitSummaryIntoSections(text, length);
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

// Builds detailed cards from real headings first, then content-based chunks.
export function buildDetailedSummaryDisplaySections(text) {
  const detailedSections = parseDetailedSummarySections(text);
  const sections = detailedSections.length ? detailedSections : splitSummaryIntoSections(text, "detailed");

  return splitOversizedDetailedSections(ensureOverviewFirst(sections));
}

// Finds detailed headings even when AI places "Heading: text" inline.
export function parseDetailedSummarySections(text) {
  const cleanText = stripMarkdownArtifacts(text)
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!cleanText) {
    return [];
  }

  const inlineSections = parseInlineDetailedHeadingSections(cleanText);

  if (inlineSections.length > 1) {
    return inlineSections;
  }

  const lineSections = parseLineDetailedHeadingSections(cleanText);

  if (lineSections.length > 1) {
    return lineSections;
  }

  return parseTopicSections(cleanText);
}

// Splits text at heading markers such as "Indexing: paragraph".
export function parseInlineDetailedHeadingSections(text) {
  const headingPattern = /(^|\n|(?<=[.!?])\s+)\s*(?:\d+[\).:-]\s*)?([A-Z][A-Za-z0-9/&+() -]{2,88}?):\s*/g;
  const matches = [...text.matchAll(headingPattern)]
    .filter((match) => isDetailedHeadingCandidate(match[2]));

  if (!matches.length) {
    return [];
  }

  const sections = [];
  const prefix = cleanDisplaySentence(text.slice(0, matches[0].index));

  if (prefix) {
    sections.push({
      title: "Overview",
      text: prefix
    });
  }

  matches.forEach((match, index) => {
    const nextMatch = matches[index + 1];
    const contentStart = match.index + match[0].length;
    const contentEnd = nextMatch ? nextMatch.index : text.length;
    const sectionText = cleanDisplaySentence(text.slice(contentStart, contentEnd));

    if (sectionText) {
      sections.push({
        title: cleanTopicTitle(match[2], index, sectionText),
        text: sectionText
      });
    }
  });

  return sections;
}

// Splits text where heading-style lines appear above paragraphs.
export function parseLineDetailedHeadingSections(text) {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const sections = [];
  let current = null;

  lines.forEach((line, index) => {
    const numberedHeading = line.match(/^\s*\d+[\).:-]\s+(.+)$/);
    const rawHeading = numberedHeading?.[1] || line;

    if (isDetailedHeadingCandidate(rawHeading) && index < lines.length - 1) {
      if (current?.text.length) {
        sections.push({
          title: current.title,
          text: cleanDisplaySentence(current.text.join(" "))
        });
      }

      current = {
        title: cleanTopicTitle(rawHeading, sections.length),
        text: []
      };
      return;
    }

    if (!current) {
      current = {
        title: sections.length ? inferDetailedHeadingFromText(line, sections.length) : "Overview",
        text: []
      };
    }

    current.text.push(line);
  });

  if (current?.text.length) {
    sections.push({
      title: current.title,
      text: cleanDisplaySentence(current.text.join(" "))
    });
  }

  return sections.filter((section) => section.text);
}

// Checks whether a short phrase can safely act as a detailed card heading.
export function isDetailedHeadingCandidate(value) {
  const cleaned = stripMarkdownArtifacts(value)
    .replace(/^\s*\d+[\).:-]\s*/, "")
    .replace(/[.;:,!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;

  if (!cleaned || wordCount > 10 || isBadSummaryHeading(cleaned)) {
    return false;
  }

  if (/^(summary|detailed summary|part\s+\d+)$/i.test(cleaned)) {
    return false;
  }

  return /^[A-Z0-9]/.test(cleaned) && !/[.!?]/.test(cleaned);
}

// Breaks long detailed sections into smaller cards without removing text.
export function splitOversizedDetailedSections(sections) {
  return sections.flatMap((section, sectionIndex) => {
    const baseTitle = cleanTopicTitle(section.title, sectionIndex, section.text);
    const chunks = splitLongDetailedSection(section, baseTitle);

    return chunks.map((chunk, chunkIndex) => {
      const inferredTitle = chunk.title || inferDetailedHeadingFromText(chunk.text, sectionIndex + chunkIndex);
      const title = chooseDetailedChunkTitle(baseTitle, inferredTitle, chunkIndex);

      return {
        title,
        text: chunk.text
      };
    });
  });
}

// Splits one detailed section, preserving real headings inside the section.
export function splitLongDetailedSection(section, baseTitle) {
  const nestedSections = parseInlineDetailedHeadingSections(section.text);

  if (nestedSections.length > 1) {
    return nestedSections;
  }

  return splitDetailedSectionText(section.text).map((chunk, index) => ({
    title: index === 0 ? baseTitle : "",
    text: chunk
  }));
}

// Uses paragraphs first, then sentence groups, so detailed cards stay readable.
export function splitDetailedSectionText(text) {
  const cleaned = stripMarkdownArtifacts(text);
  const paragraphs = cleaned
    .split(/\n{2,}|\n(?=[A-Z][A-Za-z0-9 ()/-]{2,80}:?\s*$)/)
    .map(cleanDisplaySentence)
    .filter(Boolean);
  const sourceParts = paragraphs.length ? paragraphs : [cleaned].filter(Boolean);
  const maxWords = 90;
  const chunks = [];

  sourceParts.forEach((part) => {
    const words = part.split(/\s+/).filter(Boolean);

    if (words.length <= maxWords) {
      chunks.push(part);
      return;
    }

    const sentences = splitCompactSummarySentences(part);
    let current = "";

    sentences.forEach((sentence) => {
      const candidate = [current, sentence].filter(Boolean).join(" ");

      if (candidate.split(/\s+/).length > maxWords && current) {
        chunks.push(current);
        current = sentence;
      } else {
        current = candidate;
      }
    });

    if (current) {
      chunks.push(current);
    }
  });

  return chunks.length ? chunks : [cleaned].filter(Boolean);
}

// Chooses a heading from the current chunk, only using continuation when it truly fits.
export function chooseDetailedChunkTitle(baseTitle, inferredTitle, chunkIndex) {
  const base = cleanDetailedCardTitle(cleanTopicTitle(baseTitle, chunkIndex));
  const inferred = cleanDetailedCardTitle(cleanTopicTitle(inferredTitle, chunkIndex));

  if (chunkIndex === 0) {
    return base;
  }

  if (inferred && inferred.toLowerCase() !== base.toLowerCase() && !isBadSummaryHeading(inferred)) {
    return inferred;
  }

  return `${base} - Continued`;
}

// Removes stale excessive part labels from old or badly split summaries.
export function cleanDetailedCardTitle(title) {
  return String(title || "")
    .replace(/\s+-\s+Part\s+\d+$/i, "")
    .replace(/^Part\s+\d+$/i, "Document Topic")
    .trim();
}

// Creates a meaningful detailed heading from the current card's own text.
export function inferDetailedHeadingFromText(text, index = 0) {
  const cleaned = cleanDisplaySentence(text);
  const leadingHeading = cleaned.match(/^([^:]{3,90}):\s+(.+)$/);

  if (leadingHeading && isDetailedHeadingCandidate(leadingHeading[1])) {
    return cleanTopicTitle(leadingHeading[1], index, leadingHeading[2]);
  }

  const concept = findDetailedConceptPhrase(cleaned);

  if (concept) {
    return cleanTopicTitle(concept, index, cleaned);
  }

  return buildTopicTitle(cleaned, index);
}

// Detects common DBMS/CSE concepts for detailed card headings.
export function findDetailedConceptPhrase(text) {
  const conceptPatterns = [
    /\bindexing for performance optimization\b/i,
    /\bB[-+ ]?tree and hash indexes?\b/i,
    /\bB\+?\s*tree indexes?\b/i,
    /\bhash indexes?\b/i,
    /\bentity[- ]relationship(?:\s+ER)? model\b/i,
    /\battributes? and relationships?\b/i,
    /\bprimary keys?\b/i,
    /\bforeign keys?\b/i,
    /\bkeys?\b/i,
    /\bnormalization\b/i,
    /\btransactions?\b/i,
    /\bACID properties?\b/i,
    /\bSQL sublanguages?\b/i,
    /\bdata models?\b/i,
    /\bdatabase architecture\b/i
  ];

  for (const pattern of conceptPatterns) {
    const match = String(text || "").match(pattern);

    if (match) {
      return match[0];
    }
  }

  return "";
}

// Makes sure summary cards start with an overview section.
export function ensureOverviewFirst(sections, maximumCount) {
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

// Picks the strongest sentences to create an overview.
export function buildDocumentOverview(sections) {
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

// Scores sentences that work well as an overview.
export function scoreOverviewSentence(sentence, sectionIndex) {
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

// Formats summary text before copying it to the clipboard.
export function formatSummaryForClipboard(title, text, length) {
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

// Removes markdown from copied summary text.
export function cleanClipboardText(text) {
  return normalizeTechnicalCapitalization(String(text || "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/^\s*#{1,6}\s*/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[ \t]+/g, " ")
    .trim());
}

// Copies text using Clipboard API with a textarea fallback.
export async function copyTextToClipboard(text) {
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

// Turns compact summary text into clean paragraph form.
export function normalizeCompactSummaryParagraph(text) {
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

// Expands short AI output into multiple readable summary cards.
export function expandCompactSummarySections(sections, targetCount) {
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

// Splits compact summary text into sentence-level chunks.
export function splitCompactSummarySentences(text) {
  return stripMarkdownArtifacts(text)
    .split(/\n+|;+\s*|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map(cleanDisplaySentence)
    .filter(Boolean);
}

// Avoids duplicate section headings in generated summary cards.
export function makeUniqueSummaryTitle(title, usedTitles, index) {
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

// Splits summary text into clean points for PDF export.
export function splitSummaryPoints(text) {
  const cleaned = stripMarkdownArtifacts(text);
  const points = cleaned
    .split(/\n+|[;•]+|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map(cleanDisplaySentence)
    .filter(Boolean);

  return [...new Set(points)];
}

// Removes markdown symbols so generated content displays like notes.
export function stripMarkdownArtifacts(text) {
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

// Restores common technical acronyms after cleanup.
export function normalizeTechnicalCapitalization(value) {
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

// Finds a strong topic phrase to use as a section heading.
export function findBestTopicPhrase(text) {
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

// Detects common CSE topic phrases for better headings.
export function findKnownConceptPhrase(text) {
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

// Rejects vague or broken AI headings before display.
export function isBadSummaryHeading(title) {
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

// Filters out words that should not anchor a heading.
export function isHeadingStopWord(word) {
  return /^(a|an|the|and|or|but|if|then|this|that|these|those|finally|here|therefore|however|moreover|furthermore|in|on|at|by|from|with|without|inside|outside|into|over|under|between|through|after|before|for|of|to|as|is|are|was|were|be|being|been|can|could|may|might|should|would|will|also|each|every|some|many|such)$/i
    .test(String(word || ""));
}

// Checks whether a phrase contains useful technical terms.
export function isTechnicalPhrase(phrase) {
  return /\b(cloud|service|deployment|model|virtualization|container|storage|security|process|thread|scheduling|algorithm|deadlock|memory|file|database|normalization|SQL|transaction|index|network|architecture|system|computing|resource|server|application|platform|infrastructure|software|data|management)\b/i
    .test(String(phrase || ""));
}

// Converts section headings into clean title case.
export function toTitleCase(value) {
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

// Builds and downloads the summary PDF using jsPDF.
export function exportSummaryPdf({
  document: documentData,
  summary,
  length,
  summaryText,
  pdfSections,
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
    .filter((section) => !/important questions?|q\s*&\s*a/i.test(section.title));
  let cursorY = margin;

  // Adds StudyMind branding and page numbers to each PDF page.
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

  // Starts a new page when the next block will not fit.
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

  // Writes wrapped text with optional justification.
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

  // Writes a major PDF section heading.
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

  // Writes one note point, or a comparison row when the text is table-like.
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

  // Renders pipe-separated comparison points as a simple row.
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

  addFooter();
  pdf.save(buildSummaryPdfFilename(title, pdfType));
}

// Builds and downloads a PDF version of a personal note.
export function exportNotePdf(note) {
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

// Normalizes AI-provided PDF sections or falls back to parsed summary text.
export function normalizePdfSections(pdfSections, summaryText, length) {
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

// Builds a safe file name for downloaded summary PDFs.
export function buildSummaryPdfFilename(title, pdfType = "detailed") {
  const safeTitle = String(title || "Summary")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  const suffix = pdfType === "quick" ? "Quick_Revision" : "Detailed_Notes";

  return `${safeTitle || "StudyMind"}_${suffix}.pdf`;
}

// Builds a safe file name for downloaded note PDFs.
export function buildNotePdfFilename(title) {
  const safeTitle = String(title || "Untitled Note")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");

  return `${safeTitle || "Untitled-Note"}.pdf`;
}
