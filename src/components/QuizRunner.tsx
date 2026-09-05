import { useEffect, useMemo, useState } from "react";
import type { Answers, PlayQuestion, PlayQuizData, Question, QuizSettings, SavedQuizState } from "../../shared/types.ts";
import { clearQuizProgress, saveQuizProgress } from "../storage.ts";
import { SettingsView } from "./SettingsView.tsx";
import { QuestionPage } from "./QuestionPage.tsx";
import { ResultsView } from "./ResultsView.tsx";
import { ErrorBox } from "./ErrorBox.tsx";

export type QuizRunnerProps = {
  quizData: PlayQuizData;
  saveId: string;
  source: "local" | "online";
  meta?: { quizId?: number; attemptId?: number; version?: number };
  initial?: SavedQuizState | null;
  /** Grades the answers and returns the full questions with answer keys. */
  onFinish: (answers: Answers) => Promise<Question[]>;
  onQuit: () => void;
  /** Play again. Defaults to returning to the settings screen. */
  onRestart?: () => void;
  exitLabel: string;
};

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Reorders base by a saved id order. Unknown ids are dropped, missing ones appended. */
export function orderQuestions<T extends { id: string }>(base: T[], order: string[] | undefined): T[] {
  if (!order || order.length === 0) return base;
  const byId = new Map(base.map((q) => [q.id, q]));
  const ordered = order.map((id) => byId.get(id)).filter((q): q is T => Boolean(q));
  const seen = new Set(ordered.map((q) => q.id));
  return [...ordered, ...base.filter((q) => !seen.has(q.id))];
}

function restoredIndex(initial: SavedQuizState, ordered: PlayQuestion[]): number {
  const byId = initial.currentQuestionId ? ordered.findIndex((q) => q.id === initial.currentQuestionId) : -1;
  if (byId !== -1) return byId;
  return Math.min(Math.max(initial.currentIndex, 0), Math.max(ordered.length - 1, 0));
}

export function QuizRunner({ quizData, saveId, source, meta, initial, onFinish, onQuit, onRestart, exitLabel }: QuizRunnerProps) {
  const [view, setView] = useState<"settings" | "quiz" | "results">(initial ? "quiz" : "settings");
  const [settings, setSettings] = useState<QuizSettings>(initial?.settings ?? { randomOrder: false });
  const [questions, setQuestions] = useState<PlayQuestion[]>(() =>
    initial ? orderQuestions(quizData.questions, initial.questionOrder) : quizData.questions
  );
  const [answers, setAnswers] = useState<Answers>(initial?.answers ?? {});
  const [currentIndex, setCurrentIndex] = useState(() =>
    initial ? restoredIndex(initial, orderQuestions(quizData.questions, initial.questionOrder)) : 0
  );
  const [graded, setGraded] = useState<Question[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const total = questions.length;
  const current = questions[currentIndex];
  const answeredCount = useMemo(() => Object.values(answers).filter((v) => v !== undefined).length, [answers]);
  const progressPct = total ? Math.round((answeredCount / total) * 100) : 0;

  function snapshot(): SavedQuizState {
    return {
      id: saveId,
      source,
      quizId: meta?.quizId,
      attemptId: meta?.attemptId,
      version: meta?.version,
      quizData,
      settings,
      answers,
      currentIndex,
      timestamp: Date.now(),
      completed: false,
      questionOrder: questions.map((q) => q.id),
      currentQuestionId: current?.id ?? null,
    };
  }

  // Autosave while answering, debounced by a second.
  useEffect(() => {
    if (view !== "quiz" || answeredCount === 0) return;
    const t = setTimeout(() => {
      saveQuizProgress(snapshot()).catch((e) => console.warn("Auto-save failed:", e));
    }, 1000);
    return () => clearTimeout(t);
    // snapshot() reads exactly the state listed here.
  }, [view, answers, currentIndex, questions, settings, answeredCount]);

  function start(s: QuizSettings) {
    setSettings(s);
    setQuestions(s.randomOrder ? shuffle(quizData.questions) : quizData.questions);
    setAnswers({});
    setCurrentIndex(0);
    setGraded(null);
    setError(null);
    setView("quiz");
  }

  function select(value: number | boolean) {
    if (current) setAnswers((prev) => ({ ...prev, [current.id]: value }));
  }

  function next() {
    if (current && answers[current.id] === undefined) return;
    setCurrentIndex((i) => Math.min(i + 1, total - 1));
  }

  function prev() {
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }

  async function finish() {
    const unanswered = total - answeredCount;
    if (unanswered > 0 && !window.confirm(`You still have ${unanswered} unanswered question${unanswered === 1 ? "" : "s"}. Finish anyway?`)) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const full = await onFinish(answers);
      const byId = new Map(full.map((q) => [q.id, q]));
      setGraded(questions.map((q) => byId.get(q.id)).filter((q): q is Question => Boolean(q)));
      await clearQuizProgress(saveId).catch(() => undefined);
      setView("results");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function quit() {
    if (answeredCount > 0) {
      await saveQuizProgress(snapshot()).catch((e) => console.warn("Save failed:", e));
    }
    onQuit();
  }

  return (
    <div>
      {view !== "settings" && (
        <div className="mb-6">
          <div className="flex justify-between text-sm text-neutral-400 tabular-nums mb-2">
            <span>{quizData.metadata.name}</span>
            <span>
              {answeredCount}/{total} answered · {progressPct}%
            </span>
          </div>
          <div className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      {view === "settings" && (
        <SettingsView questionCount={quizData.questions.length} quizMetadata={quizData} onStartQuiz={start} />
      )}

      {view === "quiz" && current && (
        <>
          <QuestionPage
            question={current}
            index={currentIndex}
            total={total}
            value={answers[current.id]}
            isAnswered={answers[current.id] !== undefined}
            onChange={select}
            onPrev={prev}
            onNext={next}
            onFinish={() => void finish()}
            onQuit={() => void quit()}
            quizMetadata={quizData.metadata}
            submitting={submitting}
          />
          {error && <ErrorBox message={error} />}
        </>
      )}

      {view === "results" && graded && (
        <ResultsView
          questions={graded}
          answers={answers}
          onRestart={onRestart ?? (() => setView("settings"))}
          onExit={onQuit}
          exitLabel={exitLabel}
        />
      )}
    </div>
  );
}
