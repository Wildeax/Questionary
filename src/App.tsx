import { useEffect, useMemo, useRef, useState } from "react";
import type { Question, QuizData, QuizSettings, SavedQuizState } from "./types";
import { parseQuestionsFromText } from "./utils";
import { saveQuizProgress, loadQuizProgress, clearQuizProgress } from "./storage";
import { SetupView } from "./components/SetupView";
import { SettingsView } from "./components/SettingsView";
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
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [originalQuestions, setOriginalQuestions] = useState<Question[]>([]);
  const [quizSettings, setQuizSettings] = useState<QuizSettings>({ randomOrder: false });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number | boolean | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [savedQuizData, setSavedQuizData] = useState<SavedQuizState | null>(null);
  const [savedQuizId, setSavedQuizId] = useState<string | null>(null);
  const restoringQuizRef = useRef(false);

  const total = questions.length;
  const current = questions[currentIndex];

  const answeredCount = useMemo(
    () => Object.values(answers).filter((v) => v !== undefined).length,
    [answers]
  );

  function buildSavedQuizState(quizId: string): SavedQuizState | null {
    if (!quizData) return null;

    const questionOrder = questions.map((q) => q.id);
    const currentQuestion = questions[currentIndex] ?? null;
    const orderedQuestionsSnapshot = questions.map((q) => ({ ...q }));

    return {
      id: quizId,
      quizData,
      settings: quizSettings,
      answers,
      currentIndex,
      timestamp: Date.now(),
      completed: total > 0 && answeredCount === total,
      questionOrder,
      currentQuestionId: currentQuestion ? currentQuestion.id : null,
      orderedQuestions: orderedQuestionsSnapshot,
    };
  }

  // Load saved quiz progress on app start
  useEffect(() => {
    const loadSavedProgress = async () => {
      try {
        const savedQuiz = await loadQuizProgress();
        if (savedQuiz && !savedQuiz.completed) {
          // Check if saved quiz is recent (within 7 days)
          const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
          if (savedQuiz.timestamp > sevenDaysAgo) {
            setSavedQuizData(savedQuiz);
          }
        }
      } catch (error) {
        console.warn("Failed to load saved progress:", error);
      }
    };

    loadSavedProgress();
  }, []);

  // Auto-save progress when answers change
  useEffect(() => {
    const autoSave = async () => {
      if (quizData && savedQuizId && view === "quiz" && answeredCount > 0) {
        try {
          const payload = buildSavedQuizState(savedQuizId);
          if (!payload) return;
          await saveQuizProgress(payload);
          setSavedQuizData(payload);
        } catch (error) {
          console.warn("Auto-save failed:", error);
        }
      }
    };

    // Debounce auto-save to avoid excessive saves
    const timeoutId = setTimeout(autoSave, 1000);
    return () => clearTimeout(timeoutId);
  }, [quizData, savedQuizId, answers, currentIndex, view, answeredCount, total, quizSettings, questions]);

  const progressPct = total ? Math.round((answeredCount / total) * 100) : 0;

  // Reset navigation when a new set of questions is loaded
  useEffect(() => {
    if (restoringQuizRef.current) {
      // When restoring a saved quiz we keep the stored progress intact.
      restoringQuizRef.current = false;
      return;
    }

    setCurrentIndex(0);
    setAnswers({});
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

  async function handleQuitQuiz() {
    if (!quizData) {
      setView("setup");
      return;
    }

    let quizId = savedQuizId;
    if (!quizId) {
      quizId = `quiz_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      setSavedQuizId(quizId);
    }

    const payload = buildSavedQuizState(quizId);

    if (payload) {
      try {
        await saveQuizProgress(payload);
        setSavedQuizData(payload);
      } catch (error) {
        console.warn("Failed to save quiz before quitting:", error);
      }
    }

    setView("setup");
  }

  async function handleResumeQuiz() {
    if (!savedQuizData) return;

    restoringQuizRef.current = true;

    const baseQuestions = savedQuizData.quizData.questions;
    const byId = new Map(baseQuestions.map((q) => [q.id, q]));

    const savedOrderIds =
      savedQuizData.questionOrder && savedQuizData.questionOrder.length > 0
        ? savedQuizData.questionOrder
        : savedQuizData.orderedQuestions?.map((q) => q.id);

    let orderedQuestions: Question[] = baseQuestions;
    if (savedOrderIds && savedOrderIds.length > 0) {
      const mapped = savedOrderIds
        .map((id) => byId.get(id))
        .filter((q): q is Question => Boolean(q));

      if (mapped.length > 0) {
        const mappedIds = new Set(mapped.map((q) => q.id));
        const missing = baseQuestions.filter((q) => !mappedIds.has(q.id));
        orderedQuestions = [...mapped, ...missing];
      } else if (savedQuizData.orderedQuestions && savedQuizData.orderedQuestions.length > 0) {
        orderedQuestions = savedQuizData.orderedQuestions;
      }
    } else if (savedQuizData.orderedQuestions && savedQuizData.orderedQuestions.length > 0) {
      orderedQuestions = savedQuizData.orderedQuestions;
    }

    setQuizData(savedQuizData.quizData);
    setOriginalQuestions(baseQuestions);
    setQuestions(orderedQuestions);
    setQuizSettings(savedQuizData.settings);
    setAnswers(savedQuizData.answers);
    setSavedQuizId(savedQuizData.id);

    let restoredIndex = savedQuizData.currentIndex;
    if (savedQuizData.currentQuestionId) {
      const idx = orderedQuestions.findIndex((q) => q.id === savedQuizData.currentQuestionId);
      if (idx !== -1) {
        restoredIndex = idx;
      }
    }
    if (orderedQuestions.length === 0) {
      restoredIndex = 0;
    } else {
      restoredIndex = Math.min(Math.max(restoredIndex, 0), orderedQuestions.length - 1);
    }
    setCurrentIndex(restoredIndex);

    setView("quiz");
    setSavedQuizData(null);
  }

  async function handleClearSavedQuiz() {
    try {
      if (savedQuizId) {
        await clearQuizProgress(savedQuizId);
      }
      if (savedQuizData) {
        await clearQuizProgress(savedQuizData.id);
      }
    } catch (error) {
      console.warn("Failed to clear saved quiz:", error);
    }
    setView("setup");
    setQuizData(null);
    setQuestions([]);
    setOriginalQuestions([]);
    setQuizSettings({ randomOrder: false });
    setCurrentIndex(0);
    setAnswers({});
    setSavedQuizId(null);
    setSavedQuizData(null);
  }

  function handleLoadText(text: string) {
    setError(null);
    try {
      const parsed = parseQuestionsFromText(text);
      setQuizData(parsed);
      setOriginalQuestions(parsed.questions);
      setQuestions(parsed.questions);
      setQuizSettings({ randomOrder: false }); // Reset settings when loading new questions
      // Generate new quiz ID for this session
      setSavedQuizId(`quiz_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
      setView("settings");
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
            Questionary
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
            savedQuiz={savedQuizData}
            onResume={handleResumeQuiz}
            onClearSaved={handleClearSavedQuiz}
          />
        )}

        {view === "settings" && (
          <SettingsView
            questionCount={originalQuestions.length}
            quizMetadata={quizData}
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
            onQuit={handleQuitQuiz}
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
