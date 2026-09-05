import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { Answers, PlayQuestion, Question, RoomPlayerView, RoomSnapshot } from "../../shared/types.ts";
import { ApiError, createRoom, getRoom, joinRoom, roomAnswer, roomEnd, roomNext, roomQuestions, roomStart } from "../api.ts";
import { QuestionPage } from "../components/QuestionPage.tsx";
import { ResultsView } from "../components/ResultsView.tsx";
import { ErrorBox } from "../components/ErrorBox.tsx";
import { formatDuration } from "../format.ts";

const card = "bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl";
const btn = "rounded-xl px-4 py-2 transition disabled:opacity-50";

/** Ticks every 250 ms while `until` is in the future; returns whole seconds left. */
function useCountdown(until: number | undefined): number {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!until) return;
    const tick = () => setLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [until]);
  return left;
}

export function Room() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"loading" | "missing" | "join" | "live">("loading");
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [connected, setConnected] = useState(true);
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Race mode: the stripped question list, the player's own answers, and the graded results.
  const [questions, setQuestions] = useState<PlayQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [pending, setPending] = useState<number | boolean | undefined>(undefined);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<{ questions: Question[]; answers: Answers } | null>(null);
  const streamRef = useRef<EventSource | null>(null);

  const openStream = useCallback(() => {
    streamRef.current?.close();
    const es = new EventSource(`/api/rooms/${encodeURIComponent(code)}/events`);
    es.onmessage = (e) => {
      setSnapshot(JSON.parse(e.data) as RoomSnapshot);
      setConnected(true);
    };
    es.onerror = () => setConnected(false);
    streamRef.current = es;
    setPhase("live");
  }, [code]);

  useEffect(() => {
    let alive = true;
    getRoom(code)
      .then((info) => {
        if (!alive) return;
        if (info.you) openStream();
        else setPhase("join");
      })
      .catch((e: Error) => {
        if (!alive) return;
        setPhase(e instanceof ApiError && e.status === 404 ? "missing" : "join");
        if (!(e instanceof ApiError && e.status === 404)) setError(e.message);
      });
    return () => {
      alive = false;
      streamRef.current?.close();
    };
  }, [code, openStream]);

  // Race mode: fetch the questions once the race is running and pick up where we left off.
  useEffect(() => {
    if (!snapshot || snapshot.mode !== "race" || questions) return;
    if (snapshot.state !== "running" && snapshot.state !== "finished") return;
    let alive = true;
    roomQuestions(code)
      .then((qs) => {
        if (!alive) return;
        setQuestions(qs);
        const done = new Set(snapshot.you?.answered ?? []);
        const first = qs.findIndex((q) => !done.has(q.id));
        setIndex(first === -1 ? qs.length - 1 : first);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [snapshot, questions, code]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    await act(async () => {
      await joinRoom(code, nickname);
      openStream();
    });
  }

  async function submitRaceAnswer() {
    if (!questions || pending === undefined) return;
    const q = questions[index];
    await act(async () => {
      const r = await roomAnswer(code, q.id, pending);
      const nextAnswers = { ...answers, [q.id]: pending };
      setAnswers(nextAnswers);
      setPending(undefined);
      if ("finished" in r && r.finished) {
        setResults({ questions: r.questions, answers: nextAnswers });
      } else if (index < questions.length - 1) {
        setIndex(index + 1);
      }
    });
  }

  async function playAgain() {
    if (!snapshot) return;
    await act(async () => {
      const { code: next } = await createRoom({ quizId: snapshot.quiz.id, mode: snapshot.mode, questionSeconds: snapshot.questionSeconds });
      navigate(`/r/${next}`);
    });
  }

  const countdown = useCountdown(snapshot?.state === "countdown" ? snapshot.countdownEndsAt : undefined);
  const questionLeft = useCountdown(snapshot?.state === "question" ? snapshot.question?.endsAt : undefined);

  if (phase === "loading") return <p className="text-neutral-400">Loading…</p>;
  if (phase === "missing") {
    return (
      <div className={card}>
        <p>Room not found or expired.</p>
        <Link to="/" className="underline text-sm text-neutral-400">
          Back to the catalog
        </Link>
      </div>
    );
  }
  if (phase === "join") {
    return (
      <div className={`${card} max-w-md mx-auto`}>
        <h1 className="text-2xl font-semibold">Join room {code.toUpperCase()}</h1>
        <label className="block mt-4 text-sm text-neutral-300">
          Nickname
          <input
            value={nickname}
            maxLength={20}
            onChange={(e) => setNickname(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void join()}
            className="mt-1 w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-sm"
            autoFocus
          />
        </label>
        {error && <ErrorBox message={error} />}
        <button disabled={busy || !nickname.trim()} onClick={() => void join()} className={`${btn} mt-4 bg-emerald-600 hover:bg-emerald-500 font-medium`}>
          Join
        </button>
      </div>
    );
  }
  if (!snapshot) return <p className="text-neutral-400">Connecting…</p>;

  const isHost = snapshot.you?.isHost === true;
  const total = snapshot.quiz.questionCount;

  const board = (players: RoomPlayerView[], showPoints: boolean) => (
    <table className="w-full text-sm">
      <tbody>
        {players.map((p, i) => (
          <tr key={p.id} className="border-t border-neutral-800">
            <td className="py-1.5 pr-3 tabular-nums text-neutral-400">{i + 1}</td>
            <td className="py-1.5 pr-3">
              {p.nickname}
              {p.id === snapshot.you?.id && <span className="text-neutral-500"> (you)</span>}
            </td>
            <td className="py-1.5 pr-3 tabular-nums">
              {showPoints
                ? `${p.points ?? 0} pts${p.lastPoints ? ` (+${p.lastPoints})` : ""}`
                : p.finished
                  ? `${p.correct}/${total} in ${formatDuration(p.durationMs ?? 0)}`
                  : `${p.answered}/${total}`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between text-sm text-neutral-400">
        <span>
          Room <span className="font-mono text-neutral-200">{snapshot.code}</span> · {snapshot.quiz.title} · {snapshot.mode === "race" ? "Race" : "Synchronized"}
        </span>
        {!connected && <span className="text-amber-400">Reconnecting…</span>}
      </div>
      {error && <ErrorBox message={error} />}

      {snapshot.state === "lobby" && (
        <div className={card}>
          <h1 className="text-2xl font-semibold">Waiting for players</h1>
          <p className="mt-2 text-neutral-400">
            Share this code: <span className="font-mono text-3xl text-white tracking-widest">{snapshot.code}</span>
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {snapshot.players.map((p) => (
              <li key={p.id} className="rounded-md bg-neutral-800 px-2 py-1 text-sm">
                {p.nickname}
                {p.nickname === snapshot.host && <span className="text-neutral-500"> (host)</span>}
              </li>
            ))}
          </ul>
          {isHost ? (
            <button disabled={busy} onClick={() => void act(() => roomStart(code))} className={`${btn} mt-6 bg-emerald-600 hover:bg-emerald-500 font-medium`}>
              Start
            </button>
          ) : (
            <p className="mt-6 text-sm text-neutral-400">Waiting for {snapshot.host} to start.</p>
          )}
        </div>
      )}

      {snapshot.state === "countdown" && (
        <div className={`${card} text-center`}>
          <p className="text-neutral-400">Get ready</p>
          <p className="text-7xl font-bold tabular-nums">{countdown}</p>
        </div>
      )}

      {snapshot.mode === "race" && (snapshot.state === "running" || snapshot.state === "finished") && (
        <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
          <div>
            {results ? (
              <ResultsView questions={results.questions} answers={results.answers} onRestart={() => void playAgain()} onExit={() => navigate(`/quiz/${snapshot.quiz.id}`)} exitLabel="Back to quiz" />
            ) : snapshot.state === "finished" && !results ? (
              <div className={card}>
                <p>The host ended the race.</p>
              </div>
            ) : questions ? (
              <QuestionPage
                question={questions[index]}
                index={index}
                total={questions.length}
                value={pending}
                isAnswered={pending !== undefined}
                onChange={setPending}
                onPrev={() => undefined}
                onNext={() => void submitRaceAnswer()}
                onFinish={() => void submitRaceAnswer()}
                onQuit={() => navigate(`/quiz/${snapshot.quiz.id}`)}
                quizMetadata={{ name: snapshot.quiz.title }}
                submitting={busy}
              />
            ) : (
              <p className="text-neutral-400">Loading questions…</p>
            )}
          </div>
          <aside className={card}>
            <h2 className="font-semibold mb-2">{snapshot.state === "finished" ? "Final ranking" : "Progress"}</h2>
            {board(snapshot.ranking ?? snapshot.players, false)}
            {isHost && snapshot.state === "running" && (
              <button disabled={busy} onClick={() => void act(() => roomEnd(code))} className={`${btn} mt-4 w-full bg-neutral-800 hover:bg-neutral-700 text-sm`}>
                End race
              </button>
            )}
            {isHost && snapshot.state === "finished" && (
              <button disabled={busy} onClick={() => void playAgain()} className={`${btn} mt-4 w-full bg-emerald-600 hover:bg-emerald-500 text-sm`}>
                Play again
              </button>
            )}
          </aside>
        </div>
      )}

      {snapshot.mode === "sync" && snapshot.state === "question" && snapshot.question && (
        <div className={card}>
          <div className="flex justify-between text-sm text-neutral-400 mb-2">
            <span>
              Question {snapshot.question.index + 1} of {total}
            </span>
            <span className="tabular-nums">{questionLeft}s</span>
          </div>
          <div className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden mb-4">
            <div className="h-full bg-emerald-500 transition-all duration-200" style={{ width: `${Math.min(100, (questionLeft / snapshot.questionSeconds) * 100)}%` }} />
          </div>
          <h2 className="text-2xl font-semibold mb-4">{snapshot.question.prompt}</h2>
          {snapshot.you?.answered.includes(snapshot.question.id) ? (
            <p className="text-neutral-400">Answered. Waiting for the others…</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {(snapshot.question.type === "mc" ? snapshot.question.options ?? [] : ["True", "False"]).map((label, i) => {
                const value = snapshot.question!.type === "mc" ? i : i === 0;
                return (
                  <button
                    key={i}
                    disabled={busy}
                    onClick={() => void act(() => roomAnswer(code, snapshot.question!.id, value))}
                    className="rounded-xl border border-neutral-800 bg-neutral-950 hover:border-emerald-500 p-4 text-left disabled:opacity-50"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
          <p className="mt-4 text-xs text-neutral-500">{snapshot.players.filter((p) => p.answered > (snapshot.question?.index ?? 0)).length} of {snapshot.players.length} answered</p>
        </div>
      )}

      {snapshot.mode === "sync" && snapshot.state === "reveal" && snapshot.question && snapshot.reveal && (
        <div className={card}>
          <p className="text-sm text-neutral-400">
            Question {snapshot.question.index + 1} of {total}
          </p>
          <h2 className="text-2xl font-semibold mt-1">{snapshot.question.prompt}</h2>
          <p className="mt-3">
            Correct answer:{" "}
            <span className="text-emerald-400 font-medium">
              {snapshot.question.type === "mc" ? snapshot.question.options?.[snapshot.reveal.answer as number] : snapshot.reveal.answer ? "True" : "False"}
            </span>
          </p>
          {snapshot.reveal.explanation && <p className="mt-1 text-neutral-300">{snapshot.reveal.explanation}</p>}
          <h3 className="mt-6 font-semibold mb-2">Scoreboard</h3>
          {board(snapshot.reveal.scoreboard, true)}
          {isHost && (
            <button disabled={busy} onClick={() => void act(() => roomNext(code))} className={`${btn} mt-6 bg-emerald-600 hover:bg-emerald-500 font-medium`}>
              {snapshot.question.index + 1 < total ? "Next question" : "Show final ranking"}
            </button>
          )}
        </div>
      )}

      {snapshot.mode === "sync" && snapshot.state === "finished" && snapshot.ranking && (
        <div className={card}>
          <h1 className="text-2xl font-semibold mb-4">Final ranking</h1>
          {board(snapshot.ranking, true)}
          <div className="mt-6 flex gap-3">
            {isHost && (
              <button disabled={busy} onClick={() => void playAgain()} className={`${btn} bg-emerald-600 hover:bg-emerald-500 font-medium`}>
                Play again
              </button>
            )}
            <Link to={`/quiz/${snapshot.quiz.id}`} className={`${btn} bg-neutral-800 hover:bg-neutral-700`}>
              Back to quiz
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
