import { BookmarkSimple, Play, Trash } from "@phosphor-icons/react";
import type { SavedQuizState } from "../../shared/types.ts";

export function SavedQuizCard({ saved, onResume, onClear }: { saved: SavedQuizState; onResume: () => void; onClear: () => void }) {
  const answered = Object.values(saved.answers).filter((v) => v !== undefined).length;
  const total = saved.quizData.questions.length;
  const pct = total ? Math.round((answered / total) * 100) : 0;
  return (
    <div className="max-w-3xl w-full">
      <div className="bg-blue-900/20 border border-blue-500/50 rounded-2xl p-6 shadow-xl">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="flex items-center gap-2 text-xl font-semibold text-blue-400 mb-1">
              <BookmarkSimple aria-hidden /> Continue saved quiz
            </h3>
            <div className="text-sm text-neutral-300">
              <div className="font-medium text-lg">{saved.quizData.metadata.name}</div>
              <div className="text-neutral-400">by {saved.quizData.metadata.author || "Unknown"}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-neutral-400">
              {answered} of {total} answered
            </div>
            <div className="text-sm font-medium text-blue-400">{pct}% complete</div>
          </div>
        </div>
        <div className="mb-4">
          <div className="w-full bg-neutral-700 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="text-sm text-neutral-300 mb-4">Last saved: {new Date(saved.timestamp).toLocaleString()}</div>
        <div className="flex gap-3">
          <button onClick={onResume} className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-2 bg-blue-600 hover:bg-blue-500 transition font-medium">
            <Play weight="fill" aria-hidden /> Continue
          </button>
          <button onClick={onClear} className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 bg-neutral-800 hover:bg-neutral-700 transition text-sm">
            <Trash aria-hidden /> Delete and start new
          </button>
        </div>
      </div>
    </div>
  );
}
