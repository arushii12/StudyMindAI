// Import summary service functions so the controller can forward Summary page requests.
// The service handles MongoDB summaries, important questions, AI chat, and PDF export content.
import {
  chatWithSummaryAssistant,
  deleteSummaryForUser,
  generateSummaryPdfContentForUser,
  generateSummaryForUser,
  getQuestionsForSummary,
  getSummaryForUser
} from "../services/summaryService.js";

// Called when the Summary page loads.
// It asks summaryService for the selected document summary and questions.
export async function getSummary(req, res, next) {
  try {
    // Use query values to load the selected document summary for this user.
    const summary = await getSummaryForUser(req.user, {
      documentId: req.query.documentId,
      length: req.query.length
    });
    // Send summary data back to the Summary page.
    res.json(summary);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when the user generates a summary.
// AI work and MongoDB saving happen in summaryService.
export async function generateSummary(req, res, next) {
  try {
    // Flow: React -> route -> controller -> summaryService -> MongoDB source -> AI -> saved summary.
    const summary = await generateSummaryForUser(req.user, req.body);
    // 201 means a new summary was generated and saved.
    res.status(201).json(summary);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when the user regenerates an existing summary.
// The same service refreshes the stored summary content.
export async function regenerateSummary(req, res, next) {
  try {
    // Pass the existing summary id so the service replaces that saved summary.
    const summary = await generateSummaryForUser(req.user, {
      ...req.body,
      summaryId: req.params.id
    });
    // Send summary data back to the Summary page.
    res.json(summary);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when React needs important questions for a summary.
export async function getSummaryQuestions(req, res, next) {
  try {
    // Load important questions only after the service checks the summary belongs to req.user.
    const questions = await getQuestionsForSummary(req.user, req.params.id);
    // Wrap questions in an object so the response shape is clear for React.
    res.json({ questions });
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when the user deletes a summary.
// The service also removes the stored important questions.
export async function deleteSummary(req, res, next) {
  try {
    // Delete the summary and linked questions only if they belong to this user.
    const result = await deleteSummaryForUser(req.user, req.params.id);
    // Return the service result back to React.
    res.json(result);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called by Study Assistant chat.
// The service builds document context and asks AI for a grounded answer.
export async function chatWithSummary(req, res, next) {
  try {
    // Send the document id and chat history so AI answers from this user's study material.
    const answer = await chatWithSummaryAssistant(req.user, req.params.documentId, req.body);
    // Send the AI assistant answer back to the chat UI.
    res.json(answer);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}

// Called when React exports summary notes as a PDF.
// The service prepares structured note content first.
export async function generateSummaryPdfContent(req, res, next) {
  try {
    // Build PDF-ready notes from the selected summary format requested by React.
    const content = await generateSummaryPdfContentForUser(req.user, req.body);
    // Send PDF-ready content back so React can build the file.
    res.json(content);
  } catch (error) {
    // Send errors to the global error handler in server.js.
    next(error);
  }
}
