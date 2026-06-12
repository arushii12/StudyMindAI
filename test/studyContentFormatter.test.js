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

test("quick revision removes all important questions", () => {
  const result = normalizePdfStudyNotes({
    title: "**Quick Revision PDF**",
    sections: [
      { heading: "Key Concepts", items: ["* Resource pooling shares resources."] },
      { heading: "Important Questions", items: ["What is resource pooling?"] }
    ],
    importantQuestions: [
      { question: "What is resource pooling?", answer: "Resources are shared." }
    ]
  }, "quick");

  assert.deepEqual(result.importantQuestions, []);
  assert.equal(result.sections.length, 1);
  assert.doesNotMatch(formatPdfNotesAsText(result.sections), /Important Questions|\*/);
});

test("detailed notes retain separated questions and short answers", () => {
  const result = normalizePdfStudyNotes({
    sections: [
      { heading: "Main Concepts", items: ["Rapid elasticity scales resources quickly."] }
    ],
    importantQuestions: [
      {
        question: "Question 1: Explain rapid elasticity.",
        answer: "Answer: Rapid elasticity scales cloud resources with workload demand."
      }
    ]
  }, "detailed");

  assert.equal(result.importantQuestions.length, 1);
  assert.equal(result.importantQuestions[0].question, "Explain rapid elasticity.");
  assert.equal(
    result.importantQuestions[0].answer,
    "Rapid elasticity scales cloud resources with workload demand."
  );
});

// Prompt tests are important because prompt wording controls the shape of AI output.
test("quick and detailed prompts enforce distinct output goals", () => {
  const quickPrompt = buildQuickRevisionPrompt("Source material");
  const detailedPrompt = buildDetailedNotesPrompt("Source material");

  assert.match(quickPrompt, /2-3 page exam revision sheet/i);
  assert.match(quickPrompt, /Do not include Important Questions/i);
  assert.match(quickPrompt, /importantQuestions as an empty array/i);
  assert.match(detailedPrompt, /6-7 A4 pages/i);
  assert.match(detailedPrompt, /5-8 Important Questions/i);
  assert.match(detailedPrompt, /concise 1-3 sentence answer/i);
  assert.match(detailedPrompt, /35-75 words/i);
  assert.match(detailedPrompt, /empty answer string instead of guessing/i);
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
});
