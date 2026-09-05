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

export function ResultsView({ questions, answers, onRestart, onExit, exitLabel }: ResultsProps) {
  const result = grade(questions, answers);
  const rows = questions.map((q, idx) => ({ idx, q, user: answers[q.id], isCorrect: result.perQuestion[q.id] }));
  const correctCount = result.correct;
  const total = result.total;
  const pct = total ? Math.round((correctCount / total) * 100) : 0;

  // Generate export data
  const exportResults = generateQuizResults(questions, answers);

  const handleExportJSON = () => {
    exportAsJSON(exportResults);
  };

  const handleExportCSV = () => {
    exportAsCSV(exportResults);
  };

  return (
    <div className="min-h-[70vh]">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl mb-6">
        <h2 className="text-2xl font-semibold mb-2">Results</h2>
        <p className="text-neutral-300">Score: {correctCount} / {total} ({pct}%)</p>
        <div className="mt-4 h-2 w-full bg-neutral-800 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-4 text-sm text-neutral-400">Green = correct, Red = incorrect, Gray = unanswered.</div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={handleExportCSV}
            className="rounded-xl px-4 py-2 bg-blue-600 hover:bg-blue-500 transition"
          >
            Export CSV
          </button>
          <button
            onClick={handleExportJSON}
            className="rounded-xl px-4 py-2 bg-blue-600 hover:bg-blue-500 transition"
          >
            Export JSON
          </button>
          <button onClick={onRestart} className="rounded-xl px-4 py-2 bg-neutral-800 hover:bg-neutral-700">
            Play again
          </button>
          <button onClick={onExit} className="rounded-xl px-4 py-2 bg-neutral-800 hover:bg-neutral-700">
            {exitLabel}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {rows.map(({ idx, q, user, isCorrect }) => {
          const statusColor = user === undefined
            ? "border-neutral-800"
            : isCorrect
            ? "border-emerald-500"
            : "border-red-500";

          const statusBadge = user === undefined
            ? "bg-neutral-800 text-neutral-300"
            : isCorrect
            ? "bg-emerald-500/20 text-emerald-400"
            : "bg-red-500/20 text-red-400";

          return (
            <div key={q.id} className={`border ${statusColor} rounded-2xl overflow-hidden`}>
              <div className="p-4 bg-neutral-900">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm text-neutral-400">Question {idx + 1}</div>
                  <span className={`text-xs px-2 py-1 rounded-md ${statusBadge}`}>
                    {user === undefined ? "Unanswered" : isCorrect ? "Correct" : "Incorrect"}
                  </span>
                </div>
                <div className="text-lg font-medium mb-3">{q.prompt}</div>
                <div className="grid sm:grid-cols-3 gap-3 text-sm">
                  <div className="sm:col-span-1">
                    <div className="text-neutral-400">Your answer</div>
                    <div className="text-neutral-200">
                      {formatUserAnswer(q, user)}
                    </div>
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
                      const base = "rounded-lg px-3 py-2 border text-sm";
                      const cls =
                        isRight ? `${base} border-emerald-500/60 bg-emerald-500/10` :
                        isUser ? `${base} border-red-500/60 bg-red-500/10` :
                        `${base} border-neutral-800 bg-neutral-950`;
                      return (
                        <div key={i} className={cls}>{opt}</div>
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
