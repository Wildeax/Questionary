import { ArrowCounterClockwise, ArrowLeft, Check, CheckCircle, FileCsv, FileJs, MinusCircle, Trophy, X, XCircle } from "@phosphor-icons/react";
import type { Answers, Question } from "../../shared/types.ts";
import { isMC, formatCorrectAnswer, formatUserAnswer } from "../../shared/questions.ts";
import { grade } from "../../shared/grade.ts";
import { generateQuizResults, exportAsJSON, exportAsCSV } from "../export.ts";

type ResultsProps = {
  questions: Question[];
  answers: Answers;
  onRestart: () => void;
  onExit: () => void;
  exitLabel: string;
};

const btn = "inline-flex items-center gap-2 rounded-xl px-4 py-2 transition";

const STATUS = {
  correct: { label: "Correct", icon: CheckCircle, border: "border-emerald-500", badge: "bg-emerald-500/20 text-emerald-400" },
  incorrect: { label: "Incorrect", icon: XCircle, border: "border-red-500", badge: "bg-red-500/20 text-red-400" },
  unanswered: { label: "Unanswered", icon: MinusCircle, border: "border-neutral-800", badge: "bg-neutral-800 text-neutral-300" },
} as const;

export function ResultsView({ questions, answers, onRestart, onExit, exitLabel }: ResultsProps) {
  const result = grade(questions, answers);
  const rows = questions.map((q, idx) => ({ idx, q, user: answers[q.id], isCorrect: result.perQuestion[q.id] }));
  const correctCount = result.correct;
  const total = result.total;
  const pct = total ? Math.round((correctCount / total) * 100) : 0;
  const exportResults = generateQuizResults(questions, answers);

  return (
    <div className="min-h-[70vh]">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl mb-6">
        <h2 className="flex items-center gap-2 text-2xl font-semibold mb-2">
          <Trophy className="text-amber-400" aria-hidden /> Results
        </h2>
        <p className="text-neutral-300">
          Score: {correctCount} / {total} ({pct}%)
        </p>
        <div className="mt-4 h-2 w-full bg-neutral-800 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-neutral-400">
          {Object.values(STATUS).map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1">
              <s.icon className={s.badge.split(" ")[1]} aria-hidden /> {s.label}
            </span>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button onClick={() => exportAsCSV(exportResults)} className={`${btn} bg-blue-600 hover:bg-blue-500`}>
            <FileCsv aria-hidden /> Export CSV
          </button>
          <button onClick={() => exportAsJSON(exportResults)} className={`${btn} bg-blue-600 hover:bg-blue-500`}>
            <FileJs aria-hidden /> Export JSON
          </button>
          <button onClick={onRestart} className={`${btn} bg-neutral-800 hover:bg-neutral-700`}>
            <ArrowCounterClockwise aria-hidden /> Play again
          </button>
          <button onClick={onExit} className={`${btn} bg-neutral-800 hover:bg-neutral-700`}>
            <ArrowLeft aria-hidden /> {exitLabel}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {rows.map(({ idx, q, user, isCorrect }) => {
          const status = STATUS[user === undefined ? "unanswered" : isCorrect ? "correct" : "incorrect"];
          return (
            <div key={q.id} className={`border ${status.border} rounded-2xl overflow-hidden`}>
              <div className="p-4 bg-neutral-900">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm text-neutral-400">Question {idx + 1}</div>
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md ${status.badge}`}>
                    <status.icon weight="fill" size={14} aria-hidden /> {status.label}
                  </span>
                </div>
                <div className="text-lg font-medium mb-3">{q.prompt}</div>
                <div className="grid sm:grid-cols-3 gap-3 text-sm">
                  <div className="sm:col-span-1">
                    <div className="text-neutral-400">Your answer</div>
                    <div className="text-neutral-200">{formatUserAnswer(q, user)}</div>
                  </div>
                  <div className="sm:col-span-1">
                    <div className="text-neutral-400">Correct answer</div>
                    <div className="text-neutral-200">{formatCorrectAnswer(q)}</div>
                  </div>
                  {q.explanation && (
                    <div className="sm:col-span-1">
                      <div className="text-neutral-400">Explanation</div>
                      <div className="text-neutral-300">{q.explanation}</div>
                    </div>
                  )}
                </div>

                {isMC(q) && (
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {q.options.map((opt, i) => {
                      const isRight = i === q.answer;
                      const isUser = typeof user === "number" && user === i;
                      const base = "flex items-center gap-2 rounded-lg px-3 py-2 border text-sm";
                      const cls = isRight
                        ? `${base} border-emerald-500/60 bg-emerald-500/10`
                        : isUser
                          ? `${base} border-red-500/60 bg-red-500/10`
                          : `${base} border-neutral-800 bg-neutral-950`;
                      return (
                        <div key={i} className={cls}>
                          {isRight ? (
                            <Check weight="bold" size={14} className="text-emerald-400 shrink-0" aria-hidden />
                          ) : isUser ? (
                            <X weight="bold" size={14} className="text-red-400 shrink-0" aria-hidden />
                          ) : (
                            <span className="w-3.5 shrink-0" />
                          )}
                          {opt}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
