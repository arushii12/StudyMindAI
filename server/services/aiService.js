import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

export async function generateSummary(studyMaterial, context = {}) {
  ensureStudyMaterial(studyMaterial, "summary");
  const prompt = buildSummaryPrompt(studyMaterial, context);
  return generateStructuredJson({
    prompt,
    systemPrompt: "You are an expert educational summarizer. Return structured JSON only.",
    errorLabel: "summary"
  });
}

export async function generateQuiz(studyMaterial, context = {}) {
  ensureStudyMaterial(studyMaterial, "quiz");
  const prompt = buildQuizPrompt(studyMaterial, context);
  return generateStructuredJson({
    prompt,
    systemPrompt: "You are an expert educational quiz generator. Return structured JSON only.",
    errorLabel: "quiz"
  });
}

export async function generateFlashcards(studyMaterial, context = {}) {
  ensureStudyMaterial(studyMaterial, "flashcard");
  const prompt = buildFlashcardPrompt(studyMaterial, context);
  return generateStructuredJson({
    prompt,
    systemPrompt: "You are an expert educational flashcard generator. Return structured JSON only.",
    errorLabel: "flashcard"
  });
}

export async function generateStudyAssistantAnswer(studyMaterial, context = {}) {
  const prompt = buildStudyAssistantPrompt(studyMaterial, context);
  return generateStructuredJson({
    prompt,
    systemPrompt: "You are an AI study assistant. Return structured JSON only.",
    errorLabel: "study assistant answer"
  });
}

export async function generateQuizPerformanceInsight(context = {}) {
  const prompt = buildQuizPerformanceInsightPrompt(context);
  return generateStructuredJson({
    prompt,
    systemPrompt: "You are an expert AI study coach. Return structured JSON only.",
    errorLabel: "quiz performance insight"
  });
}

export async function generatePdfStudyNotes(summaryContent, context = {}) {
  ensureStudyMaterial(summaryContent, "PDF notes");
  const pdfType = context.pdfType === "quick" ? "quick" : "detailed";
  const prompt = pdfType === "quick"
    ? buildQuickRevisionPrompt(summaryContent, context)
    : buildDetailedNotesPrompt(summaryContent, context);

  return generateStructuredJson({
    prompt,
    systemPrompt: "You are an expert study notes editor. Return structured JSON only.",
    errorLabel: `${pdfType} PDF notes`
  });
}

export function getActiveAiModelName() {
  if (process.env.GEMINI_API_KEY) {
    return GEMINI_MODEL;
  }

  if (process.env.OPENAI_API_KEY) {
    return OPENAI_MODEL;
  }

  return "";
}

async function generateStructuredJson({ prompt, systemPrompt, errorLabel }) {
  if (!process.env.GEMINI_API_KEY) {
    if (!process.env.OPENAI_API_KEY) {
      const error = new Error("GEMINI_API_KEY is not configured. Add a Gemini API key before using AI generation.");
      error.status = 503;
      throw error;
    }

    return generateWithOpenAI({ prompt, systemPrompt, errorLabel });
  }

  try {
    return await generateWithGemini({ prompt, errorLabel });
  } catch (geminiError) {
    if (!process.env.OPENAI_API_KEY) {
      throw geminiError;
    }

    return generateWithOpenAI({ prompt, systemPrompt, errorLabel });
  }
}

async function generateWithGemini({ prompt, errorLabel }) {
  const client = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
  });
  const response = await withGeminiRetry(() => client.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      temperature: 0.35,
      responseMimeType: "application/json"
    }
  }));

  return parseAiJson(extractGeminiText(response), errorLabel);
}

async function withGeminiRetry(operation) {
  const delays = [700, 1400];
  let lastError;

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isTransientAiError(error) || attempt === delays.length) {
        throw error;
      }

      await delay(delays[attempt]);
    }
  }

  throw lastError;
}

function isTransientAiError(error) {
  return [429, 500, 502, 503, 504].includes(Number(error?.status || error?.code));
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function generateWithOpenAI({ prompt, systemPrompt, errorLabel }) {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.35,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt }
    ]
  });

  return parseAiJson(response.choices?.[0]?.message?.content, errorLabel);
}

export function buildSummaryPrompt(studyMaterial, context = {}) {
  return `You are an expert educational summarizer.

Generate study-friendly summaries from the provided study material.

Return structured JSON only.

Requirements:
* Use only information present in the study material.
* Do not invent facts.
* Do not return placeholder content.
* Explain concepts clearly for student revision.
* Avoid repetitive wording.
* Organize the content as a cohesive study guide, not random notes.
* Identify the actual major topics, concepts, models, processes, systems, or theories in the source material and use those as section headings.
* Each section heading must read like a textbook chapter title and name the main topic of the whole section, such as "Cloud Service Models", "Deployment Models", "Virtualization", "Containers", "Storage Systems", "Memory Management", "Normalization", or "Scheduling Algorithms".
* Do not create headings by copying the first sentence, first few words, quoted phrases, transition words, or fragments from the paragraph.
* Never use fragment headings such as "Finally", "Here", "A Public Cloud", "This Means", or "In Addition".
* Every summary must start with an "Overview" section that defines the main subject before discussing subtopics.
* The first heading must be exactly "Overview" for short, medium, and detailed summaries.
* The Overview paragraph must explain what the document's main subject is, its basic purpose, and the main scope covered by the document.
* The Overview must be a genuine document overview, not content copied from the first narrow subtopic.
* Every section after Overview must add distinct information. Do not restate or lightly rephrase the Overview.
* Do not create both an Overview and a generic subject-named section that cover the same material.
* Before returning the JSON, merge or remove sections whose meaning substantially overlaps another section.
* Do not start directly with a subtopic such as keys, normalization, architecture, service models, or levels.
* The short summary is for concise revision. Use 3 to 5 meaningful sections.
* Each short section must contain one concise but complete paragraph. Do not use bullets, numbered lists, fragments, or detailed explanations.
* The medium summary is for structured understanding. Use 5 to 7 meaningful sections.
* Each medium section must contain one short, professional paragraph with enough context to understand the concept.
* Format every short and medium section on its own line as: "Professional Topic Heading: complete paragraph".
* Never place all short or medium concepts inside one section or one giant paragraph.
* The detailed summary is full study material. Start with a short overview section, then cover the major source topics in 5 to 10 high-quality sections with complete explanations.
* Prefer fewer strong sections that combine related ideas over many tiny sections.
* Preserve important definitions, processes, comparisons, examples, and exam-relevant points.
* Never use generic headings such as "Study Note 1", "Study Note 2", "Study Note 3", "Study Note 7", "Revision Strategy", "Exam Focus", "Important Note", "Learning Point", "Topic 1", or "Topic 2" unless that exact phrase appears as a real heading in the source material.
* Do not use bullet points, numbered lists, markdown bullets, asterisks, hashes, or code fences in any summary string.
* Normalize technical abbreviations, including DBMS, SQL, ACID, DDL, DML, DCL, TCL, ER, IaaS, PaaS, SaaS, AWS, and API.
* short must be 80 to 140 words.
* medium must be 220 to 350 words.
* detailed must be 500 to 700 words.
* Generate 5 important exam-oriented questions from the same material.

Return this JSON shape:
{
  "content": {
    "short": "...",
    "medium": "...",
    "detailed": "..."
  },
  "questions": ["...", "...", "...", "...", "..."]
}

Content scope: ${context.scope || "single-document"}
Document title: ${context.documentTitle || context.title || "Study Material"}
Subject: ${context.subject || "General Studies"}

Study material:
${trimMaterial(studyMaterial, 24000)}`;
}

function buildQuizPrompt(studyMaterial, context) {
  return `You are an expert educational quiz generator.

Generate multiple-choice questions from the provided study material.

Questions must test understanding, not memorization alone.

Return structured JSON only.

Each question must contain:
* question
* 4 answer options
* correct answer index
* explanation
* difficulty level

Do not generate generic questions.
Use only information present in the study material.

Quiz requirements:
* Generate ${context.questionCount} questions.
* Use 4 options per question.
* Exactly one option must be correct.
* correctAnswer must be a zero-based index from 0 to 3.
* Include realistic distractor options based on nearby concepts from the material.
* Difficulty mix should be approximately 30% easy, 50% medium, 20% hard.
* Avoid repetitive wording.
* Explanations must be concise and reference the provided material.

Return this JSON shape:
{
  "questions": [
    {
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "correctAnswer": 1,
      "difficulty": "medium",
      "explanation": "..."
    }
  ]
}

Content scope: ${context.scope || "single-document"}
Document title: ${context.documentTitle || "Study Material"}
Subject: ${context.subject || "General Studies"}

Study material:
${trimMaterial(studyMaterial, 18000)}`;
}

function buildQuizPerformanceInsightPrompt(context) {
  const answers = Array.isArray(context.answers) ? context.answers : [];
  const compactAnswers = answers.slice(0, 20).map((answer) => ({
    question: String(answer.questionText || "").slice(0, 500),
    status: answer.status,
    selectedAnswerIndex: Number.isInteger(answer.selectedAnswer) ? answer.selectedAnswer : null,
    correctAnswerIndex: Number.isInteger(answer.correctAnswer) ? answer.correctAnswer : null,
    options: Array.isArray(answer.options) ? answer.options.slice(0, 6) : [],
    selectedAnswer: answer.selectedAnswerText || "Not answered",
    correctAnswer: answer.correctAnswerText || "",
    explanation: String(answer.explanation || "").slice(0, 500),
    topic: answer.topic || answer.category || ""
  }));

  return `Generate a personalized quiz performance insight for a student.

Return JSON only in this exact shape:
{
  "insight": "2 to 5 concise sentences"
}

Rules:
* Base the insight only on the quiz data below.
* Mention score pattern, correct/incorrect/unanswered counts, and visible answer patterns.
* Identify strengths only when supported by correctly answered question text or reliable topic/category metadata.
* Identify weak topics or concepts needing attention when there are incorrect or unanswered answers.
* Base weak topics only on incorrect or unanswered question text, explanations, answer choices, or reliable topic/category metadata.
* Include the weak-topic guidance as a natural sentence, for example: "Topics needing attention include ...".
* If topic metadata is missing or unreliable, infer gently from question text and avoid pretending certainty.
* Do not create separate strong/weak area lists.
* Do not use markdown, bullets, headings, or generic filler.
* Keep the tone encouraging and specific for a study platform.

Quiz title: ${context.quizTitle || "StudyMind Quiz"}
Score percentage: ${Number(context.scorePercentage || 0)}%
Correct: ${Number(context.correctCount || 0)}
Incorrect: ${Number(context.incorrectCount || 0)}
Unanswered: ${Number(context.unansweredCount || 0)}
Total questions: ${Number(context.totalQuestions || 0)}

Question performance data:
${JSON.stringify(compactAnswers, null, 2)}`;
}

export function buildQuickRevisionPrompt(summaryContent, context = {}) {
  return `Create a compact but substantial exam revision sheet from the provided source material.

Return JSON only in this exact shape:
{
  "title": "Quick Revision PDF",
  "sections": [
    {
      "heading": "Overview",
      "items": ["One concise revision point", "Another concise revision point"]
    }
  ],
  "importantQuestions": []
}

Rules:
* Use only information present in the source material.
* Do not invent facts.
* Create a 2-3 page exam revision sheet when the source contains enough material.
* Aim for roughly 700-950 words for normal-sized source material, which should format into about 2-3 A4 pages.
* This must be a useful revision sheet, not a tiny summary or bare outline.
* Do not include Important Questions.
* Do not include any Q&A, practice questions, or answer section.
* Use concise bullets and a revision-friendly structure.
* Include a one-line Topic Overview, Key Concepts, Important Definitions, Important Facts, Comparison Points or compact comparison rows where useful, Formulae or Rules when present, Exam Keywords, Quick Recap, and Must-Remember Points.
* Avoid long paragraphs, repeated explanations, and unnecessary detail.
* Each item should normally be one or two concise sentences.
* Use complete, meaningful headings only. Never turn sentence fragments, product lists, examples, or comparison-row text into headings.
* Put fragment-like content such as "Both offer resources", "Adjusts instances based on demand", "AWS cloud provider", or "Docker and Kubernetes" inside section items.
* Do not use markdown formatting symbols such as *, **, #, ##, ###, or code fences.
* Do not include markdown inside any JSON string.
* Normalize technical capitalization, including IaaS, PaaS, SaaS, AWS, EC2, S3, IAM, CDN, VPC, DevOps, and CI/CD.
* Return importantQuestions as an empty array.

Document title: ${context.documentTitle || "Study Material"}
Subject: ${context.subject || "General Studies"}

Source material:
${trimMaterial(summaryContent, 26000)}`;
}

export function buildDetailedNotesPrompt(summaryContent, context = {}) {
  return `Create complete, polished study notes from the provided source material.

Return JSON only in this exact shape:
{
  "title": "Detailed Notes PDF",
  "sections": [
    {
      "heading": "Overview",
      "items": ["A clear explanation in complete sentences"]
    }
  ],
  "importantQuestions": [
    {
      "question": "What is the concept?",
      "answer": "A short answer supported by the source."
    }
  ]
}

Rules:
* Use only information present in the source material.
* Do not invent facts.
* Target around 6-7 A4 pages when the source contains enough material.
* Aim for roughly 1800-2200 words for normal-sized source material, but do not add filler to reach a page or word count.
* Include Overview, Main Concepts, Detailed Explanations, Examples where useful, Important Points, and Key Takeaways / Recap.
* Include 5-8 Important Questions in importantQuestions.
* Give each question a concise 1-3 sentence answer, normally 35-75 words, only when the source supports it.
* If the source does not confidently support an answer, return an empty answer string instead of guessing.
* Keep Important Questions separate from the notes sections.
* Use complete, meaningful topic headings and full explanations.
* Never use sentence fragments, product lists, examples, comparison cells, or phrases such as "Both Offer Resource", "Adjusts Instances Based", "Cloud Providers AWS", "Gmail Salesforce", or "Docker Kubernetes" as headings.
* Convert such fragments into normal items under a nearby meaningful heading.
* Do not use markdown formatting symbols such as *, **, #, ##, ###, or code fences.
* Do not include markdown inside any JSON string.
* Normalize technical capitalization, including IaaS, PaaS, SaaS, AWS, EC2, S3, IAM, CDN, VPC, DevOps, and CI/CD.

Document title: ${context.documentTitle || "Study Material"}
Subject: ${context.subject || "General Studies"}

Source material:
${trimMaterial(summaryContent, 36000)}`;
}

function buildFlashcardPrompt(studyMaterial, context) {
  return `You are an expert educational flashcard generator.

Generate concise flashcards from the provided study material.

Each flashcard must contain:
front
back
optional topic
optional difficulty

Flashcards must be based only on the provided study material.
Do not generate generic cards.
Return structured JSON only.

Quality rules:
* Generate ${context.cardCount} flashcards.
* Use concise front sides as terms, questions, comparisons, or "why/how" prompts.
* Use clear back sides that are useful for revision.
* Do not make the back side overly long.
* Avoid repetition.
* Include a mix of definition cards, concept cards, comparison cards, why/how cards, and key term cards.
* difficulty must be one of easy, medium, hard.

Return this JSON shape:
{
  "flashcards": [
    {
      "front": "...",
      "back": "...",
      "topic": "...",
      "difficulty": "medium"
    }
  ]
}

Content scope: ${context.scope || "single-document"}
Document title: ${context.documentTitle || "Study Material"}
Subject: ${context.subject || "General Studies"}

Study material:
${trimMaterial(studyMaterial, 18000)}`;
}

function buildStudyAssistantPrompt(studyMaterial, context) {
  const summaryText = trimMaterial(context.summaryText, 6000) || "No generated summary is available.";
  const history = Array.isArray(context.history)
    ? context.history
        .slice(-8)
        .map((message) => `${message.role === "assistant" ? "Assistant" : "Student"}: ${trimMaterial(message.content, 800)}`)
        .join("\n")
    : "";

  return `You are an AI study assistant.

You answer questions using the uploaded study notes first.
If the answer exists in the notes, prioritize that content.
If the answer is not covered in the notes, use general knowledge and clearly say so.
Keep answers educational, clear, and student-friendly.
Do not hallucinate when the notes do not support the answer.

Return structured JSON only.

Return this JSON shape:
{
  "answer": "...",
  "sourceType": "notes"
}

sourceType must be one of:
* notes
* summary
* general

Rules:
* Use notes when the uploaded PDF text directly supports the answer.
* Use summary when the generated summary supports the answer better than the extracted text.
* Use general only when the answer is not directly covered in the uploaded notes or summary.
* If sourceType is general, the answer must clearly start by saying the topic is not directly covered in the uploaded notes.
* Keep the answer concise, but include enough detail for revision.
* Use conversation history only to understand follow-up questions.

Document title: ${context.documentTitle || "Study Material"}
Subject: ${context.subject || "General Studies"}
Selected summary length: ${context.length || "short"}

Conversation history:
${history || "No previous messages in this document chat."}

Student question:
${trimMaterial(context.message, 1200)}

Generated summary:
${summaryText}

Uploaded PDF text:
${trimMaterial(studyMaterial, 18000)}`;
}

function ensureStudyMaterial(studyMaterial, type) {
  if (countWords(studyMaterial) < 40) {
    const error = new Error(`Not enough extracted study material is available to generate a ${type}.`);
    error.status = 422;
    throw error;
  }
}

function extractGeminiText(response) {
  if (response.text) {
    return response.text;
  }

  return response.candidates
    ?.flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || "")
    .join("");
}

function parseAiJson(content, errorLabel) {
  if (!content) {
    const error = new Error(`AI did not return ${errorLabel} content.`);
    error.status = 502;
    throw error;
  }

  try {
    return JSON.parse(stripJsonFences(content));
  } catch {
    const error = new Error(`AI returned malformed ${errorLabel} JSON.`);
    error.status = 502;
    throw error;
  }
}

function stripJsonFences(content) {
  return String(content)
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function trimMaterial(text, maxLength) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function countWords(text) {
  return String(text || "").split(/\s+/).filter(Boolean).length;
}
