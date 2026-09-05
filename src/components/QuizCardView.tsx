import { Link } from "react-router";
import { ArrowFatUp, ListChecks, Play, Translate } from "@phosphor-icons/react";
import type { QuizCard } from "../../shared/types.ts";
import { languageName } from "../../shared/languages.ts";

export function QuizCardView({ quiz }: { quiz: QuizCard }) {
  return (
    <Link
      to={`/quiz/${quiz.id}`}
      className="block bg-neutral-900 border border-neutral-800 hover:border-emerald-500/50 rounded-2xl p-5 transition"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold leading-snug">{quiz.title}</h3>
        <span className="flex items-center gap-1 text-xs text-neutral-400 whitespace-nowrap">
          <ListChecks size={14} aria-hidden /> {quiz.questionCount} questions
        </span>
      </div>
      {quiz.description && <p className="mt-1 text-sm text-neutral-400 line-clamp-2">{quiz.description}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-neutral-400">
        <span className="flex items-center gap-1">
          <img src={quiz.author.avatarUrl} alt="" className="h-4 w-4 rounded-full bg-neutral-800" />
          {quiz.author.username}
        </span>
        <span title="Score" className="flex items-center gap-1">
          <ArrowFatUp size={14} aria-hidden /> {quiz.score}
        </span>
        <span className="flex items-center gap-1">
          <Play size={14} aria-hidden /> {quiz.plays} plays
        </span>
        <span className="flex items-center gap-1" title="Language">
          <Translate size={14} aria-hidden /> {languageName(quiz.language)}
        </span>
        {quiz.tags.map((t) => (
          <span key={t} className="rounded-md bg-neutral-800 px-1.5 py-0.5">
            {t}
          </span>
        ))}
      </div>
    </Link>
  );
}
