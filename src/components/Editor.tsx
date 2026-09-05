import type { Question } from "../../shared/types.ts";
import { addOption, blankQuestion, move, removeOption, renumber, switchType, withOption } from "../../shared/editor.ts";

const field = "w-full bg-neutral-950 border border-neutral-800 rounded-xl p-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40";
const small = "rounded-lg px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40";

export function Editor({ value, onChange }: { value: Question[]; onChange: (questions: Question[]) => void }) {
  const emit = (next: Question[]) => onChange(renumber(next));
  const replace = (index: number, q: Question) => emit(value.map((x, j) => (j === index ? q : x)));

  return (
    <div className="space-y-4">
      {value.map((q, i) => (
        <div key={q.id} className="bg-neutral-950 border border-neutral-800 rounded-xl p-4" data-question={q.id}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs text-neutral-400">{q.id}</span>
            <div className="flex gap-1">
              <select
                value={q.type}
                onChange={(e) => replace(i, switchType(q, e.target.value as "mc" | "tf"))}
                aria-label="Question type"
                className="rounded-lg bg-neutral-800 px-2 py-1 text-xs"
              >
                <option value="mc">Multiple choice</option>
                <option value="tf">True / false</option>
              </select>
              <button type="button" onClick={() => emit(move(value, i, -1))} disabled={i === 0} aria-label="Move up" className={small}>
                ↑
              </button>
              <button type="button" onClick={() => emit(move(value, i, 1))} disabled={i === value.length - 1} aria-label="Move down" className={small}>
                ↓
              </button>
              <button type="button" onClick={() => emit(value.filter((_, j) => j !== i))} aria-label="Delete question" className={`${small} text-red-300`}>
                Delete
              </button>
            </div>
          </div>
          <textarea
            value={q.prompt}
            onChange={(e) => replace(i, { ...q, prompt: e.target.value })}
            placeholder="Question prompt"
            aria-label="Prompt"
            rows={2}
            className={field}
          />
          {q.type === "mc" ? (
            <div className="mt-2 space-y-2">
              {q.options.map((opt, k) => (
                <div key={k} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`correct-${q.id}`}
                    checked={q.answer === k}
                    onChange={() => replace(i, { ...q, answer: k })}
                    aria-label={`Option ${k + 1} is correct`}
                    className="accent-emerald-500"
                  />
                  <input
                    value={opt}
                    onChange={(e) => replace(i, withOption(q, k, e.target.value))}
                    placeholder={`Option ${k + 1}`}
                    aria-label={`Option ${k + 1}`}
                    className={field}
                  />
                  <button type="button" onClick={() => replace(i, removeOption(q, k))} disabled={q.options.length <= 2} aria-label={`Remove option ${k + 1}`} className={small}>
                    ×
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => replace(i, addOption(q))} className={small}>
                Add option
              </button>
            </div>
          ) : (
            <div className="mt-2 flex gap-4 text-sm">
              {[true, false].map((v) => (
                <label key={String(v)} className="flex items-center gap-2">
                  <input type="radio" name={`tf-${q.id}`} checked={q.answer === v} onChange={() => replace(i, { ...q, answer: v })} className="accent-emerald-500" />
                  {v ? "True" : "False"}
                </label>
              ))}
            </div>
          )}
          <input
            value={q.explanation ?? ""}
            onChange={(e) => replace(i, { ...q, explanation: e.target.value || undefined })}
            placeholder="Explanation (optional)"
            aria-label="Explanation"
            className={`${field} mt-2`}
          />
        </div>
      ))}
      <button type="button" onClick={() => emit([...value, blankQuestion(value.length)])} className="rounded-xl px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-sm">
        Add question
      </button>
    </div>
  );
}
