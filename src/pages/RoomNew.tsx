import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { RoomMode } from "../../shared/types.ts";
import { createRoom, getQuiz, type QuizDetail } from "../api.ts";
import { useMe } from "../me.tsx";
import { ErrorBox } from "../components/ErrorBox.tsx";

export function RoomNew() {
  const [params] = useSearchParams();
  const quizId = Number(params.get("quiz"));
  const navigate = useNavigate();
  const { me, loading } = useMe();
  const [quiz, setQuiz] = useState<QuizDetail | null>(null);
  const [mode, setMode] = useState<RoomMode>("race");
  const [seconds, setSeconds] = useState(20);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !me) window.location.href = "/api/auth/github";
  }, [loading, me]);

  useEffect(() => {
    let alive = true;
    getQuiz(quizId)
      .then((q) => alive && setQuiz(q))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [quizId]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const { code } = await createRoom({ quizId, mode, questionSeconds: mode === "sync" ? seconds : undefined });
      navigate(`/r/${code}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !quiz) return <ErrorBox message={error} />;
  if (!quiz) return <p className="text-neutral-400">Loading…</p>;

  return (
    <div className="max-w-xl mx-auto bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
      <h1 className="text-2xl font-semibold">Host a room</h1>
      <p className="mt-1 text-neutral-400">
        {quiz.title} · {quiz.questionCount} questions
      </p>
      <div className="mt-6 space-y-3">
        {(
          [
            ["race", "Race", "Everyone starts together and answers at their own pace. Most correct wins, fastest breaks ties."],
            ["sync", "Synchronized", "One question at a time with a timer. Faster correct answers score more."],
          ] as const
        ).map(([value, label, help]) => (
          <label key={value} className={`block rounded-xl border p-4 cursor-pointer ${mode === value ? "border-emerald-500 bg-emerald-500/10" : "border-neutral-800 hover:border-neutral-700"}`}>
            <div className="flex items-center gap-3">
              <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="accent-emerald-500" />
              <span className="font-medium">{label}</span>
            </div>
            <p className="mt-1 text-sm text-neutral-400">{help}</p>
          </label>
        ))}
      </div>
      {mode === "sync" && (
        <label className="block mt-4 text-sm text-neutral-300">
          Seconds per question
          <input
            type="number"
            min={5}
            max={120}
            value={seconds}
            onChange={(e) => setSeconds(Math.min(120, Math.max(5, Number(e.target.value) || 20)))}
            className="mt-1 w-32 bg-neutral-950 border border-neutral-800 rounded-xl p-2 text-sm"
          />
        </label>
      )}
      {error && <ErrorBox message={error} />}
      <button disabled={busy} onClick={() => void create()} className="mt-6 rounded-xl px-6 py-2 bg-emerald-600 hover:bg-emerald-500 font-medium disabled:opacity-50">
        Create room
      </button>
    </div>
  );
}
