import type { Question } from "../types";
import { isMC } from "../utils";

type QuestionPageProps = {
  question: Question;
  index: number;
  total: number;
  value: number | boolean | undefined;
  isAnswered: boolean;
  onChange: (_value: number | boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  onFinish: () => void;
};

export function QuestionPage({
  question,
  index,
  total,
  value: _value,
  isAnswered,
  onChange,
  onPrev,
  onNext,
  onFinish
}: QuestionPageProps) {
  return (
    <div className="min-h-[70vh] flex flex-col">
      <div className="flex-1 flex">
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl w-full flex flex-col">
          <div className="mb-4 text-sm text-neutral-400">Question {index + 1} of {total}</div>
          <h2 className="text-2xl font-semibold leading-snug mb-6">{question.prompt}</h2>

          {/* Options */}
          {isMC(question) ? (
            <div className="flex flex-col gap-3">
              {question.options.map((opt, i) => {
                const selected = typeof _value === "number" && _value === i;
                return (
                  <label
                    key={i}
                    className={`rounded-xl border transition cursor-pointer select-none ${
                      selected
                        ? "border-emerald-500 bg-emerald-500/10"
                        : "border-neutral-800 hover:border-neutral-700 bg-neutral-950"
                    }`}
                  >
                    <div className="flex items-center gap-3 p-4">
                      <input
                        type="radio"
                        className="h-4 w-4 accent-emerald-500"
                        name={`q-${question.id}`}
                        checked={selected}
                        onChange={() => onChange(i)}
                      />
                      <span className="text-base">{opt}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[true, false].map((boolVal, i) => {
                const selected = typeof _value === "boolean" && _value === boolVal;
                const label = boolVal ? "True" : "False";
                return (
                  <label
                    key={i}
                    className={`rounded-xl border transition cursor-pointer select-none ${
                      selected
                        ? "border-emerald-500 bg-emerald-500/10"
                        : "border-neutral-800 hover:border-neutral-700 bg-neutral-950"
                    }`}
                  >
                    <div className="flex items-center gap-3 p-4">
                      <input
                        type="radio"
                        className="h-4 w-4 accent-emerald-500"
                        name={`q-${question.id}`}
                        checked={selected}
                        onChange={() => onChange(boolVal)}
                      />
                      <span className="text-base">{label}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            <button
              onClick={onPrev}
              disabled={index === 0}
              className="rounded-xl px-4 py-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 disabled:hover:bg-neutral-800"
            >
              Previous
            </button>

            {index < total - 1 ? (
              <button
                onClick={onNext}
                disabled={!isAnswered}
                className={`rounded-xl px-4 py-2 ${
                  isAnswered
                    ? "bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700"
                    : "bg-neutral-700 cursor-not-allowed opacity-50"
                }`}
              >
                Next
              </button>
            ) : (
              <button
                onClick={onFinish}
                className="rounded-xl px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700"
              >
                Finish
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
