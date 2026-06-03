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

function buildSummaryPrompt(studyMaterial, context) {
  return `You are an expert educational summarizer.

Generate study-friendly summaries from the provided study material.

Return structured JSON only.

Requirements:
* Use only information present in the study material.
* Do not invent facts.
* Do not return placeholder content.
* Explain concepts clearly for student revision.
* Avoid repetitive wording.
* Organize the content into readable sections.
* Preserve important definitions, processes, comparisons, examples, and exam-relevant points.
* short must be 60 to 100 words.
* medium must be 150 to 250 words.
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
