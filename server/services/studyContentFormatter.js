// Technical terms that should keep standard capitalization in generated notes.
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

// Allowed headings keep exported PDF notes structured and predictable.
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
  ["key takeaways", "Key Takeaways"],
  ["key takeaways / recap", "Key Takeaways and Recap"],
  ["quick recap", "Quick Recap"],
  ["must-remember points", "Must-Remember Points"],
  ["must remember points", "Must-Remember Points"]
]);

// Clean AI text before showing it in the UI or exporting it to PDF.
// This removes markdown artifacts while keeping readable study content.
export function sanitizeAiText(value, options = {}) {
  // preserveLines controls whether paragraphs stay separated or become one line.
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

// Normalize common technical terms like DBMS, SQL, AWS, and CI/CD.
export function normalizeTechnicalCapitalization(value) {
  return TECHNICAL_TERMS.reduce((text, [term, replacement]) => {
    const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, "gi");
    return text.replace(pattern, replacement);
  }, String(value || ""));
}

// Convert AI headings into safe, meaningful section headings.
export function normalizeSectionHeading(value, fallback = "Study Notes") {
  // Remove numbering and punctuation before checking heading quality.
  const cleaned = sanitizeAiText(value, { preserveLines: false })
    .replace(/^\s*(?:section|topic)\s+\d+\s*[:.-]?\s*/i, "")
    .replace(/[.;:,!?]+$/g, "")
    .trim();
  const knownHeading = ALLOWED_SECTION_HEADINGS.get(cleaned.toLowerCase());

  // Prefer a known canonical heading when AI gives a close match.
  if (knownHeading) {
    return knownHeading;
  }

  // Fallback prevents sentence fragments from becoming section titles.
  if (!isMeaningfulHeading(cleaned)) {
    return fallback;
  }

  return toTitleCase(cleaned);
}

// Normalize AI JSON for quick or detailed PDF study notes.
export function normalizePdfStudyNotes(payload = {}, pdfType = "detailed") {
  // Convert each AI section into a heading plus clean item list.
  const rawSections = Array.isArray(payload.sections) ? payload.sections : [];
  const sections = rawSections
    .filter((section) => !isQuestionSectionHeading(section?.heading || section?.title || section?.name))
    .map((section, index) => normalizeSection(section, index))
    .filter((section) => section.items.length);

  // Support older AI output that returned notes as one text block.
  if (!sections.length) {
    sections.push(...parseLegacyNotes(payload.notes || payload.content || payload.summary));
  }

  // Keep question sections out of the main notes body.
  const filteredSections = sections.filter((section) => !/important questions?|q\s*&\s*a/i.test(section.heading));

  return {
    title: sanitizeAiText(payload.title, { preserveLines: false })
      || (pdfType === "quick" ? "Quick Revision PDF" : "Detailed Notes PDF"),
    sections: mergeDuplicateSections(filteredSections)
  };
}

// Remove legacy AI sections that contain question content before heading fallback runs.
function isQuestionSectionHeading(value) {
  return /important questions?|q\s*&\s*a|questions?\s*(?:and|&)\s*answers?/i.test(String(value || ""));
}

// Convert structured sections into plain text for jsPDF export.
export function formatPdfNotesAsText(sections = []) {
  return sections
    .map((section) => `${section.heading}:\n${section.items.join("\n")}`)
    .join("\n\n")
    .trim();
}

// Normalize one AI section into a stable heading and unique clean items.
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

// Parse older plain-text note output into section objects.
function parseLegacyNotes(value) {
  const text = sanitizeAiText(value);
  const sections = [];
  let current = null;

  text.split(/\n+/).forEach((line) => {
    const headingMatch = line.match(/^([^:]{3,70}):\s*(.*)$/);

    // Lines with meaningful "Heading: content" format start new sections.
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

// Merge duplicate headings while keeping unique items.
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

// Reject sentence fragments and random examples as headings.
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

// Convert a clean heading into title case without breaking acronyms.
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

// Escape text before using it inside a RegExp.
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
