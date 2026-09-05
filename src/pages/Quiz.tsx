import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { deleteQuiz, getQuiz, publishQuiz, unpublishQuiz, type QuizDetail } from "../api.ts";
import { useMe } from "../me.tsx";
import { ErrorBox } from "../components/ErrorBox.tsx";

const btn = "rounded-xl px-4 py-2 transition disabled:opacity-50";

export function Quiz() {
  const { id } = useParams();
  const { me } = useMe();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<QuizDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      getQuiz(id!)
        .then(setQuiz)
        .catch((e: Error) => setError(e.message)),
    [id]
  );
  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorBox message={error} />;
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

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
      {!isPublished && <div className="mb-3 text-xs uppercase tracking-wide text-amber-400">Draft</div>}
      <h1 className="text-3xl font-bold">{quiz.title}</h1>
      <Link to={`/u/${quiz.author.username}`} className="mt-2 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-200">
        <img src={quiz.author.avatarUrl} alt="" className="h-5 w-5 rounded-full bg-neutral-800" />
        {quiz.author.username}
      </Link>
      {quiz.description && <p className="mt-4 text-neutral-300 whitespace-pre-wrap">{quiz.description}</p>}
      <div className="mt-4 flex flex-wrap gap-3 text-sm text-neutral-400">
        <span>{quiz.questionCount} questions</span>
        <span>▲ {quiz.score}</span>
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
    </div>
  );
}
