import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { deleteQuiz, getQuiz, publishQuiz, unpublishQuiz, vote, type QuizDetail } from "../api.ts";
import { useMe } from "../me.tsx";
import { ErrorBox } from "../components/ErrorBox.tsx";
import { formatDuration } from "../format.ts";

const btn = "rounded-xl px-4 py-2 transition disabled:opacity-50";

export function Quiz() {
  const { id } = useParams();
  const { me } = useMe();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<QuizDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [voteHint, setVoteHint] = useState(false);

  const load = () =>
    getQuiz(id!)
      .then(setQuiz)
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    let alive = true;
    setQuiz(null);
    setError(null);
    getQuiz(id!)
      .then((q) => alive && setQuiz(q))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id]);

  if (error && !quiz) return <ErrorBox message={error} />;
  if (!quiz) return <p className="text-neutral-400">Loading…</p>;

  // Only the author receives `published`; everyone else only ever sees published quizzes.
  const isPublished = quiz.published !== false;
  const isAuthor = me?.username === quiz.author.username;
  const canModerate = isAuthor || (me?.isAdmin === true && isPublished);

  async function act(fn: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (after) after();
      else await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const castVote = (value: 1 | -1) => {
    if (!me) {
      setVoteHint(true);
      return;
    }
    setVoteHint(false);
    const next = quiz.myVote === value ? 0 : value;
    void act(() => vote(quiz.id, next));
  };

  return (
    <>
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
        {!isPublished && <div className="mb-3 text-xs uppercase tracking-wide text-amber-400">Draft</div>}
        <h1 className="text-3xl font-bold">{quiz.title}</h1>
        <Link to={`/u/${quiz.author.username}`} className="mt-2 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-200">
          <img src={quiz.author.avatarUrl} alt="" className="h-5 w-5 rounded-full bg-neutral-800" />
          {quiz.author.username}
        </Link>
        {quiz.description && <p className="mt-4 text-neutral-300 whitespace-pre-wrap">{quiz.description}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-neutral-400">
          <span className="inline-flex items-center gap-1">
            <button
              disabled={busy || isAuthor}
              onClick={() => castVote(1)}
              title={isAuthor ? "Authors cannot vote on their own quiz" : "Upvote"}
              aria-label="Upvote"
              aria-pressed={quiz.myVote === 1}
              className={`rounded-md px-2 py-0.5 ${quiz.myVote === 1 ? "bg-emerald-600 text-white" : "bg-neutral-800 hover:bg-neutral-700"} disabled:opacity-50`}
            >
              ▲
            </button>
            <span className="tabular-nums min-w-6 text-center text-neutral-200">{quiz.score}</span>
            <button
              disabled={busy || isAuthor}
              onClick={() => castVote(-1)}
              title={isAuthor ? "Authors cannot vote on their own quiz" : "Downvote"}
              aria-label="Downvote"
              aria-pressed={quiz.myVote === -1}
              className={`rounded-md px-2 py-0.5 ${quiz.myVote === -1 ? "bg-red-600 text-white" : "bg-neutral-800 hover:bg-neutral-700"} disabled:opacity-50`}
            >
              ▼
            </button>
          </span>
          {voteHint && !me && (
            <span>
              <a href="/api/auth/github" className="underline">
                Sign in
              </a>{" "}
              to vote.
            </span>
          )}
          <span>{quiz.questionCount} questions</span>
          <span>{quiz.plays} plays</span>
          {quiz.tags.map((t) => (
            <Link key={t} to={`/?tag=${encodeURIComponent(t)}`} className="rounded-md bg-neutral-800 px-1.5 py-0.5 hover:bg-neutral-700">
              {t}
            </Link>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          {isPublished && (
            <Link to={`/quiz/${quiz.id}/play`} className={`${btn} bg-emerald-600 hover:bg-emerald-500 font-medium`}>
              Play
            </Link>
          )}
          {isAuthor && (
            <Link to={`/quiz/${quiz.id}/edit`} className={`${btn} bg-neutral-800 hover:bg-neutral-700`}>
              Edit
            </Link>
          )}
          {isAuthor && (
            <a href={`/api/quizzes/${quiz.id}/export`} className={`${btn} bg-neutral-800 hover:bg-neutral-700`}>
              Download YAML
            </a>
          )}
          {isAuthor && !isPublished && (
            <button disabled={busy} onClick={() => void act(() => publishQuiz(quiz.id))} className={`${btn} bg-emerald-600 hover:bg-emerald-500`}>
              Publish
            </button>
          )}
          {canModerate && isPublished && (
            <button
              disabled={busy}
              onClick={() => void act(() => unpublishQuiz(quiz.id), isAuthor ? undefined : () => navigate("/"))}
              className={`${btn} bg-neutral-800 hover:bg-neutral-700`}
            >
              Unpublish
            </button>
          )}
          {canModerate && (
            <button
              disabled={busy}
              onClick={() => {
                if (window.confirm("Delete this quiz? This cannot be undone.")) {
                  void act(() => deleteQuiz(quiz.id), () => navigate(isAuthor ? "/me" : "/"));
                }
              }}
              className={`${btn} bg-red-600 hover:bg-red-500`}
            >
              Delete
            </button>
          )}
        </div>
        {error && <ErrorBox message={error} />}
      </div>

      {isPublished && (
        <section className="mt-6 bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
          <h2 className="text-xl font-semibold mb-3">Leaderboard</h2>
          {quiz.leaderboard.length === 0 ? (
            <p className="text-sm text-neutral-400">
              {quiz.version > 1 ? "Leaderboard reset when the quiz was updated. No attempts on this version yet." : "No attempts yet."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-neutral-400 text-left">
                <tr>
                  <th className="py-1 pr-3 font-normal">#</th>
                  <th className="py-1 pr-3 font-normal">Player</th>
                  <th className="py-1 pr-3 font-normal">Score</th>
                  <th className="py-1 pr-3 font-normal">Time</th>
                </tr>
              </thead>
              <tbody>
                {quiz.leaderboard.map((e, i) => (
                  <tr key={e.username} className="border-t border-neutral-800">
                    <td className="py-1.5 pr-3 tabular-nums">{i + 1}</td>
                    <td className="py-1.5 pr-3">
                      <Link to={`/u/${e.username}`} className="inline-flex items-center gap-2 hover:text-white">
                        <img src={e.avatarUrl} alt="" className="h-5 w-5 rounded-full bg-neutral-800" />
                        {e.username}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums">
                      {e.correct}/{e.total}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums">{formatDuration(e.durationMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {quiz.myBest && (
            <p className="mt-3 text-sm text-neutral-400">
              Your best: {quiz.myBest.correct}/{quiz.myBest.total} in {formatDuration(quiz.myBest.durationMs)}
            </p>
          )}
        </section>
      )}
    </>
  );
}
