const TECHNICAL_TERMS = [
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

const ALLOWED_SECTION_HEADINGS = new Map([
  ["overview", "Overview"],
  ["topic overview", "Topic Overview"],
  ["key concepts", "Key Concepts"],
  ["main concepts", "Main Concepts"],
  ["important definitions", "Important Definitions"],
  ["important facts", "Important Facts"],
  ["comparisons", "Comparisons"],
  ["comparison points", "Comparison Points"],
  ["formulae and rules", "Formulae and Rules"],
  ["formulas and rules", "Formulae and Rules"],
  ["formulae or rules", "Formulae and Rules"],
  ["exam keywords", "Exam Keywords"],
  ["important points", "Important Points"],
  ["detailed explanations", "Detailed Explanations"],
  ["examples", "Examples"],
  ["important questions", "Important Questions"],
  ["key takeaways", "Key Takeaways"],
  ["key takeaways / recap", "Key Takeaways and Recap"],
  ["quick recap", "Quick Recap"],
  ["must-remember points", "Must-Remember Points"],
  ["must remember points", "Must-Remember Points"]
]);

export function sanitizeAiText(value, options = {}) {
  const preserveLines = options.preserveLines !== false;
  const cleaned = normalizeTechnicalCapitalization(String(value || "")
    .replace(/```(?:[a-z0-9_-]+)?\s*/gi, "")
    .replace(/```/g, "")
    .replace(/!\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1")
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/[*#`]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/:\s*\./g, ".")
    .replace(/\.{2,}/g, "."));

  if (!preserveLines) {
    return cleaned.replace(/\s+/g, " ").trim();
  }

  return cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function normalizeTechnicalCapitalization(value) {
  return TECHNICAL_TERMS.reduce((text, [term, replacement]) => {
    const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, "gi");
    return text.replace(pattern, replacement);
  }, String(value || ""));
}

export function normalizeSectionHeading(value, fallback = "Study Notes") {
  const cleaned = sanitizeAiText(value, { preserveLines: false })
    .replace(/^\s*(?:section|topic)\s+\d+\s*[:.-]?\s*/i, "")
    .replace(/[.;:,!?]+$/g, "")
    .trim();
  const knownHeading = ALLOWED_SECTION_HEADINGS.get(cleaned.toLowerCase());

  if (knownHeading) {
    return knownHeading;
  }

  if (!isMeaningfulHeading(cleaned)) {
    return fallback;
  }

  return toTitleCase(cleaned);
}

export function normalizePdfStudyNotes(payload = {}, pdfType = "detailed") {
  const rawSections = Array.isArray(payload.sections) ? payload.sections : [];
  const sections = rawSections
    .map((section, index) => normalizeSection(section, index))
    .filter((section) => section.items.length);
  const importantQuestions = pdfType === "quick"
    ? []
    : normalizeQuestions(payload.importantQuestions || payload.questions);

  if (!sections.length) {
    sections.push(...parseLegacyNotes(payload.notes || payload.content || payload.summary));
  }

  const filteredSections = sections.filter((section) => !/important questions?|q\s*&\s*a/i.test(section.heading));

  return {
    title: sanitizeAiText(payload.title, { preserveLines: false })
      || (pdfType === "quick" ? "Quick Revision PDF" : "Detailed Notes PDF"),
    sections: mergeDuplicateSections(filteredSections),
    importantQuestions
  };
}

export function formatPdfNotesAsText(sections = []) {
  return sections
    .map((section) => `${section.heading}:\n${section.items.join("\n")}`)
    .join("\n\n")
    .trim();
}

function normalizeSection(section, index) {
  const heading = normalizeSectionHeading(
    section?.heading || section?.title || section?.name,
    index === 0 ? "Overview" : "Study Notes"
  );
  const values = Array.isArray(section?.items)
    ? section.items
    : [section?.content || section?.text || section?.notes];
  const items = values
    .flatMap((item) => String(item || "").split(/\r?\n/))
    .map((item) => sanitizeAiText(item, { preserveLines: false }))
    .map((item) => item.replace(/^\s*(?:[-*+]|\d+[).])\s*/, "").trim())
    .filter(Boolean);

  return { heading, items: [...new Set(items)] };
}

function normalizeQuestions(questions) {
  if (!Array.isArray(questions)) {
    return [];
  }

  return questions
    .map((item) => ({
      question: sanitizeAiText(item?.question || item?.prompt || item, { preserveLines: false })
        .replace(/^\s*(?:question|q)\s*\d*\s*[:.)-]?\s*/i, "")
        .trim(),
      answer: sanitizeAiText(item?.answer || "", { preserveLines: false })
        .replace(/^\s*answer\s*[:.)-]?\s*/i, "")
        .trim()
    }))
    .filter((item) => item.question)
    .slice(0, 10);
}

function parseLegacyNotes(value) {
  const text = sanitizeAiText(value);
  const sections = [];
  let current = null;

  text.split(/\n+/).forEach((line) => {
    const headingMatch = line.match(/^([^:]{3,70}):\s*(.*)$/);

    if (headingMatch && isMeaningfulHeading(headingMatch[1])) {
      current = {
        heading: normalizeSectionHeading(headingMatch[1], sections.length ? "Study Notes" : "Overview"),
        items: []
      };
      sections.push(current);

      if (headingMatch[2]) {
        current.items.push(headingMatch[2]);
      }
      return;
    }

    if (!current) {
      current = { heading: "Overview", items: [] };
      sections.push(current);
    }
    current.items.push(line);
  });

  return sections
    .map((section, index) => normalizeSection(section, index))
    .filter((section) => section.items.length);
}

function mergeDuplicateSections(sections) {
  const merged = new Map();

  sections.forEach((section) => {
    const key = section.heading.toLowerCase();
    const existing = merged.get(key) || { heading: section.heading, items: [] };
    existing.items.push(...section.items);
    existing.items = [...new Set(existing.items)];
    merged.set(key, existing);
  });

  return [...merged.values()];
}

function isMeaningfulHeading(value) {
  const text = String(value || "").trim();
  const words = text.split(/\s+/).filter(Boolean);

  if (!text || words.length > 8 || /[.!?]/.test(text)) {
    return false;
  }

  if (/^(both|adjusts?|cloud providers?|gmail|docker)\b/i.test(text)) {
    return false;
  }

  if (/\b(based|offer|instances?|providers?|salesforce|kubernetes)\s*$/i.test(text)) {
    return false;
  }

  return words.length >= 2 || ALLOWED_SECTION_HEADINGS.has(text.toLowerCase());
}

function toTitleCase(value) {
  const smallWords = new Set(["and", "or", "of", "to", "in", "for", "with", "on", "the", "a", "an"]);

  return normalizeTechnicalCapitalization(value)
    .split(/\s+/)
    .map((word, index) => {
      if (/[A-Z].*[A-Z/]|\d/.test(word)) {
        return word;
      }

      const lower = word.toLowerCase();
      return index > 0 && smallWords.has(lower)
        ? lower
        : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
