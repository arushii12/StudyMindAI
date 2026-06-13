// Use Node's built-in test runner so formatter rules can be checked without extra tooling.
import test from "node:test";
import assert from "node:assert/strict";
import {
  formatPdfNotesAsText,
  normalizePdfStudyNotes,
  normalizeSectionHeading,
  sanitizeAiText
} from "../server/services/studyContentFormatter.js";
import {
  buildSummaryPrompt,
  buildDetailedNotesPrompt,
  buildQuickRevisionPrompt
} from "../server/services/aiService.js";

// This test protects the UI from raw AI markdown leaking into study notes.
test("sanitizes markdown artifacts and normalizes technical capitalization", () => {
  const result = sanitizeAiText("* **On-Demand Self-Service:** uses iaas, aws ec2, devops, and ci/cd.");

  assert.equal(
    result,
    "On-Demand Self-Service: uses IaaS, AWS EC2, DevOps, and CI/CD."
  );
  assert.doesNotMatch(result, /[*#`]/);
});

test("rejects accidental fragment headings", () => {
  assert.equal(normalizeSectionHeading("Both Offer Resource", "Study Notes"), "Study Notes");
  assert.equal(normalizeSectionHeading("Adjusts Instances Based", "Study Notes"), "Study Notes");
  assert.equal(normalizeSectionHeading("Cloud Providers AWS", "Study Notes"), "Study Notes");
  assert.equal(normalizeSectionHeading("Docker Kubernetes", "Study Notes"), "Study Notes");
  assert.equal(normalizeSectionHeading("Cloud Service Models", "Study Notes"), "Cloud Service Models");
});

test("PDF notes remove question sections from exported notes", () => {
  const result = normalizePdfStudyNotes({
    title: "**Quick Revision PDF**",
    sections: [
      { heading: "Key Concepts", items: ["* Resource pooling shares resources."] },
      { heading: "Important Questions", items: ["What is resource pooling?"] }
    ]
  }, "quick");

  assert.equal(result.sections.length, 1);
  assert.doesNotMatch(formatPdfNotesAsText(result.sections), /Important Questions|\*/);
});

test("detailed notes ignore old question payloads", () => {
  const result = normalizePdfStudyNotes({
    sections: [
      { heading: "Main Concepts", items: ["Rapid elasticity scales resources quickly."] },
      { heading: "Q&A", items: ["What is rapid elasticity?"] }
    ],
    importantQuestions: [
      {
        question: "Question 1: Explain rapid elasticity.",
        answer: "Answer: Rapid elasticity scales cloud resources with workload demand."
      }
    ]
  }, "detailed");

  assert.equal(result.sections.length, 1);
  assert.equal(result.sections[0].heading, "Main Concepts");
  assert.equal(result.importantQuestions, undefined);
});

// Prompt tests are important because prompt wording controls the shape of AI output.
test("quick and detailed prompts enforce distinct output goals", () => {
  const quickPrompt = buildQuickRevisionPrompt("Source material");
  const detailedPrompt = buildDetailedNotesPrompt("Source material");

  assert.match(quickPrompt, /2-3 page exam revision sheet/i);
  assert.doesNotMatch(quickPrompt, /importantQuestions/i);
  assert.match(detailedPrompt, /6-7 A4 pages/i);
  assert.doesNotMatch(detailedPrompt, /importantQuestions/i);
  assert.match(detailedPrompt, /Do not include any Q&A/i);
});

test("summary prompt keeps short and medium summaries scannable", () => {
  const prompt = buildSummaryPrompt("Database study material");

  assert.match(prompt, /Every summary must start with an "Overview" section/i);
  assert.match(prompt, /first heading must be exactly "Overview"/i);
  assert.match(prompt, /basic purpose, and the main scope/i);
  assert.match(prompt, /genuine document overview/i);
  assert.match(prompt, /short summary is for concise revision/i);
  assert.match(prompt, /3 to 5 meaningful sections/i);
  assert.match(prompt, /medium summary is for structured understanding/i);
  assert.match(prompt, /5 to 7 meaningful sections/i);
  assert.match(prompt, /Do not use bullet points, numbered lists/i);
  assert.match(prompt, /complete paragraph/i);
  assert.doesNotMatch(prompt, /"questions"/i);
});
