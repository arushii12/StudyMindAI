import React from "react";
import {
  ArrowLeft,
  BookOpen,
  Brain,
  ClipboardList,
  FileText,
  Lightbulb,
  LineChart,
  MessageCircle,
  NotebookPen,
  Trophy,
  Upload
} from "lucide-react";

const workflowSteps = [
  {
    title: "Upload PDF / Text",
    description: "Upload your PDFs or paste study text to start building your learning workspace.",
    icon: Upload,
    tone: "purple",
    href: "#library"
  },
  {
    title: "Generate AI Summary",
    description: "Get concise notes, key points, and important concepts from your documents.",
    icon: FileText,
    tone: "green",
    href: "#summary"
  },
  {
    title: "Ask the AI Tutor",
    description: "Use AI Tutor to clarify doubts and understand difficult topics.",
    icon: MessageCircle,
    tone: "blue",
    href: "#summary"
  },
  {
    title: "Review Flashcards",
    description: "Reinforce your learning with AI-generated flashcards.",
    icon: BookOpen,
    tone: "gold",
    href: "#flashcards"
  },
  {
    title: "Take Quiz",
    description: "Test your understanding with AI-generated questions.",
    icon: ClipboardList,
    tone: "pink",
    href: "#quizzes"
  },
  {
    title: "Review Weak Topics",
    description: "Identify your weak areas and revisit the concepts that need improvement.",
    icon: Brain,
    tone: "orange",
    href: "#review"
  },
  {
    title: "Create Notes",
    description: "Copy AI summaries, add your own points, and build a personal revision notebook.",
    icon: NotebookPen,
    tone: "gold",
    href: "#notes"
  },
  {
    title: "Track Progress",
    description: "Monitor your learning activity and performance from the Dashboard and Analytics sections.",
    icon: LineChart,
    tone: "teal",
    href: "#dashboard"
  }
];

const studyFlowSteps = [
  { label: "Upload PDF / Text", description: "Add your study material", icon: Upload, tone: "purple" },
  { label: "AI Summary", description: "Get key points and notes", icon: FileText, tone: "green" },
  { label: "AI Tutor", description: "Clarify doubts and concepts", icon: MessageCircle, tone: "blue" },
  { label: "Flashcards", description: "Review and memorize", icon: BookOpen, tone: "gold" },
  { label: "Quiz", description: "Test your understanding", icon: ClipboardList, tone: "pink" },
  { label: "Weak Topics", description: "Focus on areas that need work", icon: Brain, tone: "orange" },
  { label: "Notes", description: "Build your notebook", icon: NotebookPen, tone: "gold" },
  { label: "Track Progress", description: "Monitor growth", icon: LineChart, tone: "teal" }
];

// Explains the app workflow without loading backend data.
function HowItWorksPage() {
  return (
    <div className="how-page">
      <header className="how-header">
        <a className="how-back-button" href="#dashboard">
          <ArrowLeft size={18} />
          <span>Back</span>
        </a>
        <h1>How It Works</h1>
        <p>Learn the complete StudyMind AI workflow from uploading content to revision and progress tracking.</p>
      </header>

      <section className="how-steps-grid" aria-label="StudyMind workflow steps">
        {workflowSteps.map((step, index) => {
          const Icon = step.icon;
          const stepNumber = String(index + 1).padStart(2, "0");

          return (
            <a
              aria-label={`${step.title}: ${step.description}`}
              className={`how-step-card ${step.tone}`}
              href={step.href}
              key={step.title}
            >
              <div className="how-icon-square">
                <Icon size={28} />
              </div>
              <div className="how-step-copy">
                <span>STEP {index + 1}</span>
                <h2>{step.title}</h2>
                <p>{step.description}</p>
              </div>
              <strong aria-hidden="true">{stepNumber}</strong>
            </a>
          );
        })}
      </section>

      <section className="how-flow-card">
        <div className="how-section-heading">
          <h2>Recommended Study Flow</h2>
          <p>Follow this proven workflow to master any topic.</p>
        </div>
        <div className="how-flow-track" aria-label="Recommended Study Flow">
          {studyFlowSteps.map((step, index) => {
            const Icon = step.icon;

            return (
              <React.Fragment key={step.label}>
                <div className={`how-flow-item ${step.tone}`}>
                  <div className="how-flow-icon">
                    <Icon size={26} />
                  </div>
                  <strong>{step.label}</strong>
                  <span>{step.description}</span>
                </div>
                {index < studyFlowSteps.length - 1 && <span className="how-flow-arrow" aria-hidden="true">→</span>}
              </React.Fragment>
            );
          })}
        </div>
        <div className="how-return-cycle" aria-hidden="true">
          <span />
        </div>
      </section>

      <section className="how-tip-card">
        <div className="how-tip-main">
          <div className="how-tip-icon">
            <Lightbulb size={28} />
          </div>
          <div>
            <h2>Pro Tip</h2>
            <p>Consistency is the key! Follow the workflow regularly and use the Weak Topics section to focus your revision.</p>
          </div>
        </div>
        <div className="how-tip-result">
          <Trophy size={34} />
          <strong>Small steps every day lead to big results!</strong>
        </div>
      </section>
    </div>
  );
}

export default HowItWorksPage;
