import { CaretLeft, CaretRight, CheckCircle, CircleNotch, Flag, X } from "@phosphor-icons/react";
import type { PlayQuestion, QuizMetadata } from "../../shared/types.ts";
import { isMC } from "../../shared/questions.ts";

type QuestionPageProps = {
  question: PlayQuestion;
  index: number;
  total: number;
  value: number | boolean | undefined;
  isAnswered: boolean;
  onChange: (_value: number | boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  onFinish: () => void;
  onQuit: () => void;
  quizMetadata: QuizMetadata;
  submitting?: boolean;
  hidePrev?: boolean;
};

function Option({ selected, label, name, onSelect }: { selected: boolean; label: string; name: string; onSelect: () => void }) {
  return (
    <label
      className={`rounded-xl border transition cursor-pointer select-none ${
        selected ? "border-emerald-500 bg-emerald-500/10" : "border-neutral-800 hover:border-neutral-700 bg-neutral-950"
      }`}
    >
      <div className="flex items-center gap-3 p-4">
        <input type="radio" className="h-4 w-4 accent-emerald-500" name={name} checked={selected} onChange={onSelect} />
        <span className="text-base flex-1">{label}</span>
        {selected && <CheckCircle weight="fill" size={20} className="text-emerald-400" aria-hidden />}
      </div>
    </label>
  );
}

export function QuestionPage({
  question,
  index,
  total,
  value,
  isAnswered,
  onChange,
  onPrev,
  onNext,
  onFinish,
  onQuit,
  quizMetadata,
  submitting,
  hidePrev,
}: QuestionPageProps) {
  const name = `q-${question.id}`;
  return (
    <div className="min-h-[70vh] flex flex-col">
      <div className="flex-1 flex">
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl w-full flex flex-col">
          <div className="mb-2 text-xs text-neutral-500">
            {quizMetadata.name} - Questionary{quizMetadata.author ? ` (${quizMetadata.author})` : ""}
          </div>
          <div className="mb-4 text-sm text-neutral-400">
            Question {index + 1} of {total}
          </div>
          <h2 className="text-2xl font-semibold leading-snug mb-6">{question.prompt}</h2>

          {isMC(question) ? (
            <div className="flex flex-col gap-3">
              {question.options.map((opt, i) => (
                <Option key={i} name={name} label={opt} selected={typeof value === "number" && value === i} onSelect={() => onChange(i)} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[true, false].map((boolVal) => (
                <Option
                  key={String(boolVal)}
                  name={name}
                  label={boolVal ? "True" : "False"}
                  selected={typeof value === "boolean" && value === boolVal}
                  onSelect={() => onChange(boolVal)}
                />
              ))}
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-3">
              <button onClick={onQuit} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 bg-red-600 hover:bg-red-500 active:bg-red-700 transition">
                <X weight="bold" aria-hidden /> Quit
              </button>
              {!hidePrev && (
                <button
                  onClick={onPrev}
                  disabled={index === 0}
                  className="inline-flex items-center gap-1 rounded-xl px-4 py-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 disabled:hover:bg-neutral-800"
                >
                  <CaretLeft aria-hidden /> Previous
                </button>
              )}
            </div>

            <div>
              {index < total - 1 ? (
                <button
                  onClick={onNext}
                  disabled={!isAnswered}
                  className={`inline-flex items-center gap-1 rounded-xl px-4 py-2 ${
                    isAnswered ? "bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700" : "bg-neutral-700 cursor-not-allowed opacity-50"
                  }`}
                >
                  Next <CaretRight aria-hidden />
                </button>
              ) : (
                <button
                  onClick={onFinish}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-60"
                >
                  {submitting ? <CircleNotch className="animate-spin" aria-hidden /> : <Flag weight="fill" aria-hidden />}
                  {submitting ? "Submitting…" : "Finish"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
