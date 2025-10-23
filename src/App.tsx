import { useEffect, useMemo, useState } from "react";
import type { Question } from "./types";
import { parseQuestionsFromText } from "./utils";
import { saveQuizState, loadQuizState, clearQuizState } from "./storage";
import { SetupView } from "./components/SetupView";
import { SettingsView, type QuizSettings } from "./components/SettingsView";
import { QuestionPage } from "./components/QuestionPage";
import { ResultsView } from "./components/ResultsView";

/**
 * Unity Senior Certified – 100‑question Quiz Page
 * ------------------------------------------------
 * Features
 * - One question per full page (Previous / Next; Finish on last question)
 * - Supports Multiple‑Choice (single answer) and True/False questions
 * - Results screen: shows correct/incorrect per question and the right answer
 * - Import questions from JSON or YAML (paste or upload). No questions are hardcoded.
 * - Minimal, clean Tailwind UI. No external design system required.
 *
 * Question Schema (JSON/YAML)
 * ---------------------------
 * Each question must conform to one of the two shapes:
 *
 * type: "mc" (Multiple Choice)
 * {
 *   id: "q1",
 *   type: "mc",
 *   prompt: "<your question here>",
 *   options: ["A", "B", "C", "D"],
 *   answer: 1, // the index in options that is correct (0‑based)
 *   explanation?: "<optional explanation>"
 * }
 *
 * type: "tf" (True/False)
 * {
 *   id: "q2",
 *   type: "tf",
 *   prompt: "<your true/false statement here>",
 *   answer: true, // or false
 *   explanation?: "<optional explanation>"
 * }
 *
 * Example JSON document (short):
 * [
 *   { "id": "q1", "type": "mc", "prompt": "<your question>", "options": ["A","B","C","D"], "answer": 2 },
 *   { "id": "q2", "type": "tf", "prompt": "<your statement>", "answer": true }
 * ]
 *
 * Example YAML document (short):
 * - id: q1
 *   type: mc
 *   prompt: "<your question>"
 *   options: ["A", "B", "C", "D"]
 *   answer: 2
 * - id: q2
 *   type: tf
 *   prompt: "<your statement>"
 *   answer: true
 */

export default function QuizPage() {
  const [view, setView] = useState<"setup" | "settings" | "quiz" | "results">("setup");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [originalQuestions, setOriginalQuestions] = useState<Question[]>([]);
  // @ts-expect-error - quizSettings is stored for future settings but not currently used
  const [quizSettings, setQuizSettings] = useState<QuizSettings>({ randomOrder: false });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number | boolean | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [showResumePrompt, setShowResumePrompt] = useState(false);

  const total = questions.length;
  const current = questions[currentIndex];

  const answeredCount = useMemo(
    () => Object.values(answers).filter((v) => v !== undefined).length,
    [answers]
  );

  const progressPct = total ? Math.round((answeredCount / total) * 100) : 0;

  // Load saved quiz state on component mount
  useEffect(() => {
    const savedState = loadQuizState();
    if (savedState) {
      setView(savedState.view);
      setQuestions(savedState.questions);
      setCurrentIndex(savedState.currentIndex);
      setAnswers(savedState.answers);
      setShowResumePrompt(true);
    }
  }, []);

  // Save quiz state whenever it changes
  useEffect(() => {
    if (questions.length > 0) {
      saveQuizState({
        view,
        questions,
        currentIndex,
        answers,
        timestamp: Date.now()
      });
    }
  }, [view, questions, currentIndex, answers]);

  // Reset navigation when a new set of questions is loaded
  useEffect(() => {
    setCurrentIndex(0);
    setAnswers({});
    clearQuizState(); // Clear saved state when new questions are loaded
  }, [questions]);

  function onSelectAnswer(value: number | boolean) {
    if (!current) return;
    setAnswers((prev) => ({ ...prev, [current.id]: value }));
  }

  function handleNext() {
    if (currentIndex < total - 1) {
      // Check if current question is answered
      if (current && answers[current.id] === undefined) {
        alert("Please answer the current question before proceeding to the next one.");
        return;
      }
      setCurrentIndex((i) => i + 1);
    }
  }
  function handlePrev() {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  }

  function handleFinish() {
    // Optional confirmation if there are unanswered questions
    const unanswered = total - answeredCount;
    if (unanswered > 0) {
      const ok = window.confirm(
        `You still have ${unanswered} unanswered question${unanswered === 1 ? "" : "s"}. Finish anyway?`
      );
      if (!ok) return;
    }
    setView("results");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleResumeQuiz() {
    setShowResumePrompt(false);
    // Quiz state is already loaded, just hide the prompt
  }

  function handleClearSavedQuiz() {
    clearQuizState();
    setView("setup");
    setQuestions([]);
    setOriginalQuestions([]);
    setQuizSettings({ randomOrder: false });
    setCurrentIndex(0);
    setAnswers({});
    setShowResumePrompt(false);
  }

  function handleLoadText(text: string) {
    setError(null);
    try {
      const parsed = parseQuestionsFromText(text);
      setOriginalQuestions(parsed);
      setQuestions(parsed);
      setQuizSettings({ randomOrder: false }); // Reset settings when loading new questions
      setView("settings");
      setShowResumePrompt(false);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  function handleUploadFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => handleLoadText(String(reader.result));
    reader.onerror = () => setError("Failed to read the file.");
    reader.readAsText(file);
  }

  function handleStartQuiz(settings: QuizSettings) {
    setQuizSettings(settings);

    let quizQuestions = [...originalQuestions];
    if (settings.randomOrder) {
      // Fisher-Yates shuffle algorithm
      for (let i = quizQuestions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [quizQuestions[i], quizQuestions[j]] = [quizQuestions[j], quizQuestions[i]];
      }
    }

    setQuestions(quizQuestions);
    setView("quiz");
  }

  return (
    <div className="min-h-screen w-full bg-neutral-950 text-neutral-100 flex flex-col">
      {/* Header */}
      <header className="w-full border-b border-neutral-800 sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-neutral-950/80">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight">
            Unity Senior Certified — Questionnaire
          </h1>
          <div className="text-sm tabular-nums opacity-80">
            {(view === "quiz" || view === "results") && (
              <span>
                {answeredCount}/{total} answered · {progressPct}%
              </span>
            )}
          </div>
        </div>
        {(view === "quiz" || view === "results") && (
          <div className="mx-auto max-w-5xl px-4 pb-4">
            <div className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
      </header>

      {/* Body */}
      <main className="flex-1 mx-auto max-w-5xl w-full px-4 py-8">
        {view === "setup" && (
          <SetupView
            error={error}
            onPasteLoad={handleLoadText}
            onFileSelected={handleUploadFile}
            showResumePrompt={showResumePrompt}
            onResume={handleResumeQuiz}
            onClearSaved={handleClearSavedQuiz}
          />
        )}

        {view === "settings" && (
          <SettingsView
            questionCount={originalQuestions.length}
            onStartQuiz={handleStartQuiz}
          />
        )}

        {view === "quiz" && current && (
          <QuestionPage
            question={current}
            index={currentIndex}
            total={total}
            value={answers[current.id]}
            isAnswered={answers[current.id] !== undefined}
            onChange={onSelectAnswer}
            onPrev={handlePrev}
            onNext={handleNext}
            onFinish={handleFinish}
          />
        )}

        {view === "results" && (
          <ResultsView questions={questions} answers={answers} onRestart={() => setView("setup")} />
        )}
      </main>

      {/* Footer note */}
      <footer className="mx-auto max-w-5xl w-full px-4 pb-6 text-xs text-neutral-400">
        <p>
          Tip: Paste your JSON or YAML with quiz questions. The app supports any number of
          questions with multiple choice (mc) and true/false (tf) types.
        </p>
      </footer>
    </div>
  );
}
