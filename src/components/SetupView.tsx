import { useState } from "react";
import { getTemplate } from "../templates";
import type { SavedQuizState } from "../../shared/types.ts";
import { SavedQuizCard } from "./SavedQuizCard.tsx";

type SetupProps = {
  error: string | null;
  onPasteLoad: (_text: string) => void;
  onFileSelected: (_file: File) => void;
  savedQuiz: SavedQuizState | null;
  onResume: () => void;
  onClearSaved: () => void;
};

export function SetupView({ error, onPasteLoad, onFileSelected: _onFileSelected, savedQuiz, onResume, onClearSaved }: SetupProps) {
  const [text, setText] = useState("");

  return (
    <div className="w-full min-h-[70vh] flex flex-col items-center justify-center gap-6">
      {savedQuiz && <SavedQuizCard saved={savedQuiz} onResume={onResume} onClear={onClearSaved} />}

      <div className="max-w-3xl w-full">
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
          <h2 className="text-xl font-semibold mb-2">Play a quiz file (offline)</h2>
          <p className="text-sm text-neutral-400 mb-4">
            Paste your document below or upload a .json / .yaml / .yml file. Nothing is sent to the server. Documents must start with metadata containing a required title and optional author. The quiz supports
            <span className="mx-1 font-mono text-neutral-200">mc</span> (multiple choice) and
            <span className="mx-1 font-mono text-neutral-200">tf</span> (true/false) types.
          </p>

          <textarea
            className="w-full h-56 bg-neutral-950 border border-neutral-800 rounded-xl p-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            placeholder={
              `Paste JSON or YAML here...\n\nExample JSON:\n[\n  { "metadata": { "name": "My Quiz", "author": "Optional" } },\n  { "id": "q1", "type": "mc", "prompt": "<your question>", "options": ["A","B","C","D"], "answer": 2 },\n  { "id": "q2", "type": "tf", "prompt": "<your statement>", "answer": true }\n]`
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
          />

          <div className="mt-4 flex flex-col sm:flex-row items-stretch gap-3">
            <button
              onClick={() => onPasteLoad(text)}
              className="inline-flex items-center justify-center rounded-xl px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 transition font-medium"
            >
              Load from Paste
            </button>

            <label className="inline-flex items-center justify-center rounded-xl px-4 py-2 bg-neutral-800 hover:bg-neutral-700 cursor-pointer">
              <input
                type="file"
                accept=".json,.yaml,.yml,application/json,application/x-yaml,text/yaml,text/x-yaml"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) _onFileSelected(f);
                }}
              />
              Upload File
            </label>

            <button
              onClick={() => {
                const template = getTemplate("yaml");
                setText(template);
              }}
              className="inline-flex items-center justify-center rounded-xl px-4 py-2 bg-neutral-800 hover:bg-neutral-700 transition"
            >
              Insert YAML Template
            </button>

            <button
              onClick={() => {
                const template = getTemplate("json");
                setText(template);
              }}
              className="inline-flex items-center justify-center rounded-xl px-4 py-2 bg-neutral-800 hover:bg-neutral-700 transition"
            >
              Insert JSON Template
            </button>
          </div>

          {error && (
            <div className="mt-4 text-sm text-red-400 whitespace-pre-wrap">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
