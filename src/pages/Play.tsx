import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import type { Answers, PlayQuizData, Question, SavedQuizState } from "../../shared/types.ts";
import { ApiError, getPlay, gradeAnonymous, startAttempt, submitAttempt } from "../api.ts";
import { clearQuizProgress, getSavedQuiz } from "../storage.ts";
import { useMe } from "../me.tsx";
import { QuizRunner } from "../components/QuizRunner.tsx";
import { SavedQuizCard } from "../components/SavedQuizCard.tsx";
import { ErrorBox } from "../components/ErrorBox.tsx";

type Phase =
  | { kind: "loading" }
  | { kind: "resume"; saved: SavedQuizState }
  | { kind: "run"; data: PlayQuizData; attemptId?: number; version: number; initial: SavedQuizState | null; runKey: number }
  | { kind: "stale" }
  | { kind: "error"; message: string };

export function Play() {
  const { id } = useParams();
  const quizId = Number(id);
  const { me, loading } = useMe();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const saveId = `online_${quizId}_${me?.id ?? "anon"}`;
  const runToken = useRef(0);

  async function start() {
    const token = ++runToken.current;
    setPhase({ kind: "loading" });
    try {
      const s = me ? await startAttempt(quizId) : await getPlay(quizId);
      if (token !== runToken.current) return;
      setPhase({
        kind: "run",
        data: { metadata: { name: s.title, author: s.author.username }, questions: s.questions },
        attemptId: s.attemptId,
        version: s.version,
        initial: null,
        runKey: Date.now(),
      });
    } catch (e) {
      if (token !== runToken.current) return;
      setPhase({ kind: "error", message: (e as Error).message });
    }
  }

  useEffect(() => {
    if (loading) return;
    let alive = true;
    (async () => {
      const saved = await getSavedQuiz(saveId);
      if (!alive) return;
      if (saved && !saved.completed) setPhase({ kind: "resume", saved });
      else await start();
    })();
    return () => {
      alive = false;
      runToken.current++;
    };
    // start() closes over me and quizId, both listed here.
  }, [loading, me, quizId]);

  async function onFinish(answers: Answers, attemptId?: number): Promise<Question[]> {
    try {
      const r = attemptId ? await submitAttempt(attemptId, answers) : await gradeAnonymous(quizId, answers);
      return r.questions;
    } catch (e) {
      if (e instanceof ApiError && (e.status === 409 || e.status === 404)) {
        await clearQuizProgress(saveId).catch(() => undefined);
        setPhase({ kind: "stale" });
      }
      throw e;
    }
  }

  if (phase.kind === "loading") return <p className="text-neutral-400">Loading…</p>;
  if (phase.kind === "error") return <ErrorBox message={phase.message} />;
  if (phase.kind === "stale") {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
        <p className="text-neutral-200">This attempt can no longer be submitted. The quiz was updated by its author or removed.</p>
        <button onClick={() => void start()} className="mt-4 rounded-xl px-4 py-2 bg-emerald-600 hover:bg-emerald-500">
          Start over
        </button>
      </div>
    );
  }
  if (phase.kind === "resume") {
    const saved = phase.saved;
    return (
      <div className="flex justify-center">
        <SavedQuizCard
          saved={saved}
          onResume={() =>
            setPhase({
              kind: "run",
              data: saved.quizData,
              attemptId: saved.attemptId,
              version: saved.version ?? 0,
              initial: saved,
              runKey: Date.now(),
            })
          }
          onClear={async () => {
            await clearQuizProgress(saveId).catch(() => undefined);
            await start();
          }}
        />
      </div>
    );
  }

  return (
    <QuizRunner
      key={phase.runKey}
      quizData={phase.data}
      saveId={saveId}
      source="online"
      meta={{ quizId, attemptId: phase.attemptId, version: phase.version }}
      initial={phase.initial}
      onFinish={(answers) => onFinish(answers, phase.attemptId)}
      onQuit={() => navigate(`/quiz/${quizId}`)}
      onRestart={() => void start()}
      exitLabel="Back to quiz"
    />
  );
}
