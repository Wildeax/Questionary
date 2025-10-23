import { useState } from "react";
import type { QuizData } from "../types";

type SettingsProps = {
  questionCount: number;
  quizMetadata: QuizData | null;
  onStartQuiz: (_settings: QuizSettings) => void;
};

export type QuizSettings = {
  randomOrder: boolean;
};

export function SettingsView({ questionCount, quizMetadata, onStartQuiz }: SettingsProps) {
  const [randomOrder, setRandomOrder] = useState(false);

  const handleStartQuiz = () => {
    onStartQuiz({ randomOrder });
  };

  return (
    <div className="w-full min-h-[70vh] flex flex-col items-center justify-center gap-6">
      <div className="max-w-3xl w-full">
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
          {/* Quiz Title and Author */}
          <div className="mb-6 pb-4 border-b border-neutral-800">
            <h1 className="text-3xl font-bold text-center mb-2">
              {quizMetadata?.metadata.name || "Untitled Quiz"}
            </h1>
            <p className="text-sm text-neutral-400 text-center">
              by {quizMetadata?.metadata.author || "Unknown"}
            </p>
          </div>

          <h2 className="text-2xl font-semibold mb-2">Quiz Settings</h2>
          <p className="text-sm text-neutral-400 mb-6">
            Configure your quiz preferences before starting. You have {questionCount} question{questionCount !== 1 ? 's' : ''} loaded.
          </p>

          {/* Random Order Setting */}
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-neutral-800/50 rounded-xl">
              <div className="flex-1">
                <h3 className="font-medium text-neutral-200">Random Question Order</h3>
                <p className="text-sm text-neutral-400 mt-1">
                  Shuffle questions so they appear in random order instead of the loaded sequence
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={randomOrder}
                  onChange={(e) => setRandomOrder(e.target.checked)}
                />
                <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-500/25 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>
          </div>

          {/* Start Button */}
          <div className="mt-8 flex justify-center">
            <button
              onClick={handleStartQuiz}
              className="inline-flex items-center justify-center rounded-xl px-8 py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 transition font-medium text-lg"
            >
              Start Quiz
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
