# StudyMind AI

StudyMind AI is a full-stack AI study workspace that helps students turn uploaded PDFs into summaries, flashcards, quizzes, review material, and progress insights. It combines a Vite React frontend with an Express/MongoDB backend and AI generation through Gemini or OpenAI.

## Purpose

Students often spend more time organizing notes than actually studying them. StudyMind AI solves that by converting PDF study material into structured, interactive learning tools.

| Area | Value |
| --- | --- |
| Problem solved | Reduces manual note summarization, quiz creation, and revision planning. |
| Intended users | Students, self-learners, exam candidates, and anyone studying from PDF notes. |
| Key benefits | Faster revision, organized study libraries, AI-assisted explanations, practice quizzes, and progress tracking. |

## Features

| Feature | Description |
| --- | --- |
| PDF Upload & Management | Upload PDF files, extract readable text, rename documents, view original PDFs, download PDFs, move files, and delete files. |
| Study Library | Manage uploaded study material through a dedicated library interface with folder-level views and file actions. |
| Folder Organization | Create, rename, delete, and browse subject folders; move PDFs between folders. |
| AI Summaries | Generate short, medium, and detailed summaries from uploaded PDFs or selected documents. |
| AI Tutor | Ask contextual questions about uploaded notes and transform tutor answers into shorter explanations, exam answers, flashcards, or quizzes. |
| Flashcards | Generate AI flashcard decks, review cards, mark progress, restart decks, and delete flashcard sets. |
| Quiz Generation | Generate multiple-choice quizzes, submit attempts, review explanations, retake quizzes, and delete quizzes. |
| Quiz Insights | Generate AI performance insights after quiz attempts. |
| Review Center | Save summaries for revision, mark important questions, browse review folders, and remove saved review items. |
| Progress Tracking | Dashboard metrics for PDFs, quiz attempts, average score, study streaks, study time, goals, and continue-learning recommendations. |
| Daily Goals | Set study-time or quiz goals and track progress for the day. |
| Authentication | Register, login, logout, update profile details, and maintain sessions with secure HTTP-only cookies. |
| Production Loading UX | Premium loading banners, spinners, long-operation messages, and accessible loading states across async workflows. |

## Tech Stack

| Layer | Technologies |
| --- | --- |
| Frontend | React 19, Vite, CSS, Lucide React, PDF.js, jsPDF |
| Backend | Node.js, Express, CORS, dotenv |
| Database | MongoDB with Mongoose |
| Authentication | bcrypt, JSON Web Tokens, HTTP-only cookies |
| File Uploads | multer, local `server/uploads` storage |
| PDF Processing | pdf-parse, PDF.js |
| AI Services | Google Gemini via `@google/genai`, OpenAI via `openai` |
| Deployment | Vercel for frontend, Render for backend, MongoDB Atlas for database |

## Installation & Setup

### 1. Clone the repository

```bash
git clone <repository-url>
cd StudyMindAI
```

### 2. Install dependencies

```bash
npm install
```

This project has one root `package.json`. The frontend and backend share the same dependency install.

### 3. Configure environment variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Then update the values for your local or production environment.

### 4. Run locally

Run frontend and backend together:

```bash
npm run dev
```

Run only the backend:

```bash
npm run server
```

Run only the frontend:

```bash
npm run client
```

Default local URLs:

```txt
Frontend: http://localhost:5173
Backend:  http://127.0.0.1:5001
Health:   http://127.0.0.1:5001/api/health
```

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | Backend port. Defaults to `5001`; Render provides this automatically. |
| `HOST` | Production recommended | Backend bind host. Use `0.0.0.0` on Render. Defaults to `127.0.0.1`. |
| `NODE_ENV` | Production recommended | Set to `production` for secure cookies in production. |
| `MONGO_URI` | Yes | MongoDB connection string. MongoDB Atlas can be used directly. |
| `JWT_SECRET` | Yes | Secret used to sign authentication tokens. Use a long random value. |
| `CLIENT_ORIGIN` | Production recommended | Allowed frontend origin for CORS, for example `https://your-app.vercel.app`. |
| `GEMINI_API_KEY` | Optional if OpenAI is configured | Google Gemini API key for AI generation. |
| `GEMINI_MODEL` | No | Gemini model name. Defaults to `gemini-2.5-flash`. |
| `OPENAI_API_KEY` | Optional if Gemini is configured | OpenAI API key for AI generation fallback. |
| `OPENAI_MODEL` | No | OpenAI model name. Defaults to `gpt-4o-mini`. |

At least one AI provider should be configured:

```txt
GEMINI_API_KEY=...
```

or:

```txt
OPENAI_API_KEY=...
```

## Project Structure

```txt
StudyMindAI/
├── src/
│   ├── main.jsx          # Main React application, pages, components, and UI logic
│   └── styles.css        # Global styling and responsive UI styles
├── server/
│   ├── config/           # MongoDB connection configuration
│   ├── controllers/      # Express route handlers
│   ├── middleware/       # Authentication and PDF upload middleware
│   ├── models/           # Mongoose schemas
│   ├── routes/           # API route definitions
│   ├── services/         # Business logic, AI calls, PDF processing, dashboard logic
│   ├── uploads/          # Temporary local PDF uploads
│   └── server.js         # Express app entry point
├── index.html            # Vite HTML entry
├── package.json          # Shared frontend/backend scripts and dependencies
├── vite.config.js        # Vite config and local API proxy
├── vercel.json           # Vercel rewrite for /api requests to Render backend
├── DEPLOYMENT.md         # Deployment notes, including upload storage warning
└── .env.example          # Example environment configuration
```

## Application Workflow

```txt
Upload PDF
  -> Organize Library
  -> Generate AI Summary
  -> Ask AI Tutor Questions
  -> Study with Flashcards
  -> Take Quiz
  -> Review Saved Items
  -> Track Progress
```

## Deployment

### Frontend on Vercel

Recommended Vercel settings:

```txt
Root Directory: .
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

The app uses relative API calls such as `/api/auth/login`. The included `vercel.json` rewrites `/api/*` requests to the Render backend:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://studymindai-ejb8.onrender.com/api/:path*"
    }
  ]
}
```

### Backend on Render

Recommended Render settings:

```txt
Root Directory: .
Build Command: npm install
Start Command: npm start
```

`npm start` runs:

```bash
node server/server.js
```

Production backend environment:

```txt
NODE_ENV=production
HOST=0.0.0.0
MONGO_URI=mongodb+srv://...
JWT_SECRET=...
CLIENT_ORIGIN=https://your-vercel-app.vercel.app
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
```

## Upload Storage Note

The current implementation stores uploaded PDFs in `server/uploads` using `multer.diskStorage`. This can work temporarily on a single Render web service, but it is not durable production storage. Files may be lost after deploys, restarts, scaling, or instance replacement.

For production-grade uploads, move PDF storage to a durable service such as:

- Cloudinary
- AWS S3
- UploadThing
- MongoDB GridFS
- Another object storage provider

## API Overview

| Area | Routes |
| --- | --- |
| Auth | `/api/auth/register`, `/api/auth/login`, `/api/auth/me`, `/api/auth/profile`, `/api/auth/logout` |
| Dashboard | `/api/dashboard`, `/api/dashboard/goal`, `/api/dashboard/activity`, `/api/dashboard/continue-learning/hide` |
| Documents | `/api/documents`, `/api/documents/upload`, `/api/documents/:id/pdf`, rename, move, delete |
| Folders | `/api/folders`, `/api/folders/:id`, `/api/folders/:id/documents` |
| Summaries | `/api/summaries`, `/api/summaries/generate`, `/api/summaries/:id/regenerate`, `/api/summaries/:documentId/chat` |
| Quizzes | `/api/quizzes`, `/api/quizzes/generate`, `/api/quizzes/:id/attempt`, `/api/quizzes/:id/insight` |
| Flashcards | `/api/flashcards`, `/api/flashcards/generate`, `/api/flashcards/:id/review`, `/api/flashcards/:id/progress` |
| Review | `/api/review/summaries`, `/api/review/questions`, `/api/review/folders` |

## Future Enhancements

- Move PDF uploads from local disk to durable cloud storage.
- Add frontend API base URL support for deployments that do not use Vercel rewrites.
- Add automated test coverage for services, routes, and core UI flows.
- Add role-based access control for classrooms or teams.
- Add shared folders and collaborative study groups.
- Add spaced-repetition scheduling for flashcards.
- Add richer analytics for weak topics and long-term performance.
- Add streaming AI responses for the tutor experience.

## Author

Arushi
