import { useState } from "react";
import { Play, Shuffle, SlidersHorizontal } from "@phosphor-icons/react";
import type { QuizMetadata, QuizSettings } from "../../shared/types.ts";

type SettingsProps = {
  questionCount: number;
  quizMetadata: { metadata: QuizMetadata } | null;
  onStartQuiz: (_settings: QuizSettings) => void;
};

export function SettingsView({ questionCount, quizMetadata, onStartQuiz }: SettingsProps) {
  const [randomOrder, setRandomOrder] = useState(false);

  return (
    <div className="w-full min-h-[70vh] flex flex-col items-center justify-center gap-6">
      <div className="max-w-3xl w-full">
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
          <div className="mb-6 pb-4 border-b border-neutral-800">
            <h1 className="text-3xl font-bold text-center mb-2">{quizMetadata?.metadata.name || "Untitled Quiz"}</h1>
            <p className="text-sm text-neutral-400 text-center">by {quizMetadata?.metadata.author || "Unknown"}</p>
          </div>

          <h2 className="flex items-center gap-2 text-2xl font-semibold mb-2">
            <SlidersHorizontal className="text-neutral-400" aria-hidden /> Quiz Settings
          </h2>
          <p className="text-sm text-neutral-400 mb-6">
            Configure your quiz preferences before starting. You have {questionCount} question{questionCount !== 1 ? "s" : ""} loaded.
          </p>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 p-4 bg-neutral-800/50 rounded-xl">
              <Shuffle size={24} className="shrink-0 text-emerald-400" aria-hidden />
              <div className="flex-1">
                <h3 className="font-medium text-neutral-200">Random Question Order</h3>
                <p className="text-sm text-neutral-400 mt-1">Shuffle questions so they appear in random order instead of the loaded sequence</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={randomOrder} onChange={(e) => setRandomOrder(e.target.checked)} />
                <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-500/25 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>
          </div>

          <div className="mt-8 flex justify-center">
            <button
              onClick={() => onStartQuiz({ randomOrder })}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-8 py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 transition font-medium text-lg"
            >
              <Play weight="fill" aria-hidden /> Start Quiz
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
