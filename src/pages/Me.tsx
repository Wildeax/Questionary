import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { QuizCard } from "../../shared/types.ts";
import { getMyQuizzes, type MyQuizzes } from "../api.ts";
import { useMe } from "../me.tsx";
import { QuizCardView } from "../components/QuizCardView.tsx";
import { ErrorBox } from "../components/ErrorBox.tsx";

function Section({ title, quizzes, empty }: { title: string; quizzes: QuizCard[]; empty: string }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold mb-3">{title}</h2>
      {quizzes.length === 0 ? (
        <p className="text-neutral-400 text-sm">{empty}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {quizzes.map((q) => (
            <div key={q.id}>
              <QuizCardView quiz={q} />
              <Link to={`/quiz/${q.id}/edit`} className="mt-1 inline-block text-xs text-neutral-400 hover:text-neutral-200 underline">
                Edit
              </Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function Me() {
  const { me, loading } = useMe();
  const [data, setData] = useState<MyQuizzes | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!me) {
      window.location.href = "/api/auth/github";
      return;
    }
    getMyQuizzes()
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [loading, me]);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <p className="text-neutral-400">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">My quizzes</h1>
        <Link to="/new" className="rounded-xl px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-sm font-medium">
          New quiz
        </Link>
      </div>
      <Section title="Drafts" quizzes={data.drafts} empty="No drafts." />
      <Section title="Published" quizzes={data.published} empty="Nothing published yet." />
    </div>
  );
}
