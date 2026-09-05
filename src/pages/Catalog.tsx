import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { listQuizzes, type QuizPage } from "../api.ts";
import { QuizCardView } from "../components/QuizCardView.tsx";
import { ErrorBox } from "../components/ErrorBox.tsx";

const SORTS = ["top", "new", "popular"] as const;

export function Catalog() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const sort = params.get("sort") ?? "top";
  const tag = params.get("tag") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [data, setData] = useState<QuizPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    listQuizzes({ q, sort, tag, page })
      .then((d) => alive && setData(d))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [q, sort, tag, page]);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {SORTS.map((s) => (
          <button
            key={s}
            onClick={() => setParam("sort", s === "top" ? "" : s)}
            className={`rounded-xl px-3 py-1.5 text-sm ${sort === s ? "bg-emerald-600" : "bg-neutral-800 hover:bg-neutral-700"}`}
          >
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
        {q && (
          <span className="text-sm text-neutral-400">
            Results for "{q}"{" "}
            <button onClick={() => setParam("q", "")} className="underline">
              clear
            </button>
          </span>
        )}
        {tag && (
          <span className="text-sm text-neutral-400">
            Tag: {tag}{" "}
            <button onClick={() => setParam("tag", "")} className="underline">
              clear
            </button>
          </span>
        )}
      </div>

      {error && <ErrorBox message={error} />}
      {data && data.items.length === 0 && (
        <p className="text-neutral-400">
          No quizzes here yet.{" "}
          <Link to="/new" className="underline">
            Publish one
          </Link>
          .
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {data?.items.map((quiz) => (
          <QuizCardView key={quiz.id} quiz={quiz} />
        ))}
      </div>
      {data && (page > 1 || data.hasMore) && (
        <div className="mt-6 flex gap-3">
          {page > 1 && (
            <button onClick={() => setParam("page", String(page - 1))} className="rounded-xl px-4 py-2 bg-neutral-800 hover:bg-neutral-700">
              Previous
            </button>
          )}
          {data.hasMore && (
            <button onClick={() => setParam("page", String(page + 1))} className="rounded-xl px-4 py-2 bg-neutral-800 hover:bg-neutral-700">
              Next
            </button>
          )}
        </div>
      )}
    </div>
  );
}
