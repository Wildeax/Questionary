import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { CaretLeft, CaretRight, ChartLineUp, Compass, DoorOpen, Fire, Sparkle, Tag, X, type Icon } from "@phosphor-icons/react";
import { getTags, listQuizzes, type QuizPage } from "../api.ts";
import type { TagCount } from "../../shared/types.ts";
import { QuizCardView } from "../components/QuizCardView.tsx";
import { ErrorBox } from "../components/ErrorBox.tsx";

const SORTS: [string, string, Icon][] = [
  ["top", "Top", Fire],
  ["new", "New", Sparkle],
  ["popular", "Popular", ChartLineUp],
];

export function Catalog() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState("");
  const q = params.get("q") ?? "";
  const sort = params.get("sort") ?? "top";
  const tag = params.get("tag") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [data, setData] = useState<QuizPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tags, setTags] = useState<TagCount[]>([]);

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

  useEffect(() => {
    let alive = true;
    getTags()
      .then((t) => alive && setTags(t))
      .catch(() => alive && setTags([]));
    return () => {
      alive = false;
    };
  }, []);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  }

  const filterChip = (label: string, clear: () => void) => (
    <span className="inline-flex items-center gap-1 rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-1.5 text-sm text-neutral-300">
      {label}
      <button onClick={clear} aria-label={`Clear ${label}`} className="text-neutral-500 hover:text-white">
        <X size={14} weight="bold" />
      </button>
    </span>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {SORTS.map(([s, label, SortIcon]) => (
          <button
            key={s}
            onClick={() => setParam("sort", s === "top" ? "" : s)}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm ${sort === s ? "bg-emerald-600" : "bg-neutral-800 hover:bg-neutral-700"}`}
          >
            <SortIcon weight={sort === s ? "fill" : "duotone"} aria-hidden /> {label}
          </button>
        ))}
        {q && filterChip(`Results for "${q}"`, () => setParam("q", ""))}
        {tag && filterChip(`Tag: ${tag}`, () => setParam("tag", ""))}
        <form
          className="ml-auto flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(`/r/${joinCode.trim()}`);
          }}
        >
          <input
            aria-label="Room code"
            value={joinCode}
            maxLength={6}
            placeholder="Room code"
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            className="w-32 rounded-xl bg-neutral-950 border border-neutral-800 px-3 py-1.5 text-sm font-mono tracking-widest"
          />
          <button
            type="submit"
            disabled={joinCode.trim().length !== 6}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50"
          >
            <DoorOpen aria-hidden /> Join room
          </button>
        </form>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <Tag className="text-neutral-500" aria-hidden />
          {tags.map((t) => (
            <button
              key={t.tag}
              onClick={() => setParam("tag", tag === t.tag ? "" : t.tag)}
              className={`rounded-md px-2 py-0.5 text-xs ${tag === t.tag ? "bg-emerald-600 text-white" : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300"}`}
            >
              {t.tag} <span className="opacity-60">{t.count}</span>
            </button>
          ))}
        </div>
      )}

      {error && <ErrorBox message={error} />}
      {data && data.items.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-neutral-400">
          <Compass size={48} aria-hidden />
          <p>
            No quizzes here yet.{" "}
            <Link to="/new" className="underline">
              Publish one
            </Link>
            .
          </p>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {data?.items.map((quiz) => (
          <QuizCardView key={quiz.id} quiz={quiz} />
        ))}
      </div>
      {data && (page > 1 || data.hasMore) && (
        <div className="mt-6 flex gap-3">
          {page > 1 && (
            <button onClick={() => setParam("page", String(page - 1))} className="flex items-center gap-1 rounded-xl px-4 py-2 bg-neutral-800 hover:bg-neutral-700">
              <CaretLeft aria-hidden /> Previous
            </button>
          )}
          {data.hasMore && (
            <button onClick={() => setParam("page", String(page + 1))} className="flex items-center gap-1 rounded-xl px-4 py-2 bg-neutral-800 hover:bg-neutral-700">
              Next <CaretRight aria-hidden />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
