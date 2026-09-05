import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ClockCounterClockwise, Globe, NotePencil, PencilSimple, Plus, type Icon } from "@phosphor-icons/react";
import type { AttemptSummary, QuizCard } from "../../shared/types.ts";
import { getMyAttempts, getMyQuizzes, type MyQuizzes } from "../api.ts";
import { useMe } from "../me.tsx";
import { QuizCardView } from "../components/QuizCardView.tsx";
import { ErrorBox } from "../components/ErrorBox.tsx";
import { Loading } from "../components/Loading.tsx";
import { formatDuration } from "../format.ts";

function Heading({ icon: HeadingIcon, children }: { icon: Icon; children: string }) {
  return (
    <h2 className="flex items-center gap-2 text-xl font-semibold mb-3">
      <HeadingIcon className="text-neutral-400" aria-hidden /> {children}
    </h2>
  );
}

function Section({ title, icon, quizzes, empty }: { title: string; icon: Icon; quizzes: QuizCard[]; empty: string }) {
  return (
    <section className="mb-8">
      <Heading icon={icon}>{title}</Heading>
      {quizzes.length === 0 ? (
        <p className="text-neutral-400 text-sm">{empty}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {quizzes.map((q) => (
            <div key={q.id}>
              <QuizCardView quiz={q} />
              <Link to={`/quiz/${q.id}/edit`} className="mt-1 inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-200 underline">
                <PencilSimple size={14} aria-hidden /> Edit
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
  const [attempts, setAttempts] = useState<AttemptSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!me) {
      window.location.href = "/api/auth/github";
      return;
    }
    Promise.allSettled([getMyQuizzes(), getMyAttempts()]).then(([quizzes, attemptsResult]) => {
      if (quizzes.status === "rejected") {
        setError((quizzes.reason as Error).message);
        return;
      }
      setData(quizzes.value);
      setAttempts(attemptsResult.status === "fulfilled" ? attemptsResult.value : []);
    });
  }, [loading, me]);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">My quizzes</h1>
        <Link to="/new" className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-sm font-medium">
          <Plus weight="bold" aria-hidden /> New quiz
        </Link>
      </div>
      <Section title="Drafts" icon={NotePencil} quizzes={data.drafts} empty="No drafts." />
      <Section title="Published" icon={Globe} quizzes={data.published} empty="Nothing published yet." />

      <section className="mb-8">
        <Heading icon={ClockCounterClockwise}>History</Heading>
        {!attempts || attempts.length === 0 ? (
          <p className="text-neutral-400 text-sm">No finished attempts yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-neutral-400 text-left">
              <tr>
                <th className="py-1 pr-3 font-normal">Quiz</th>
                <th className="py-1 pr-3 font-normal">Score</th>
                <th className="py-1 pr-3 font-normal">Time</th>
                <th className="py-1 pr-3 font-normal">When</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((a) => (
                <tr key={a.id} className="border-t border-neutral-800">
                  <td className="py-1.5 pr-3">
                    <Link to={`/quiz/${a.quiz.id}`} className="hover:text-white">
                      {a.quiz.title}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">
                    {a.correct}/{a.total}
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">{formatDuration(a.durationMs)}</td>
                  <td className="py-1.5 pr-3">{new Date(a.finishedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
