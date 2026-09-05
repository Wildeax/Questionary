import { useCallback, useEffect, useState } from "react";
import type { PlayQuizData, Question, SavedQuizState } from "../../shared/types.ts";
import { parseQuestionsFromText } from "../../shared/validate.ts";
import { clearQuizProgress, loadLatestLocalQuiz } from "../storage.ts";
import { SetupView } from "../components/SetupView.tsx";
import { QuizRunner } from "../components/QuizRunner.tsx";

export function Local() {
  const [quizData, setQuizData] = useState<PlayQuizData | null>(null);
  const [saved, setSaved] = useState<SavedQuizState | null>(null);
  const [initial, setInitial] = useState<SavedQuizState | null>(null);
  const [saveId, setSaveId] = useState("");
  const [runKey, setRunKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const loadSaved = useCallback(() => loadLatestLocalQuiz().then(setSaved), []);
  useEffect(() => {
    void loadSaved();
  }, [loadSaved]);

  function loadText(text: string) {
    setError(null);
    try {
      const parsed = parseQuestionsFromText(text);
      setQuizData(parsed);
      setInitial(null);
      setSaveId(`quiz_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
      setRunKey((k) => k + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function loadFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => loadText(String(reader.result));
    reader.onerror = () => setError("Failed to read the file.");
    reader.readAsText(file);
  }

  function resume() {
    if (!saved) return;
    setQuizData(saved.quizData);
    setInitial(saved);
    setSaveId(saved.id);
    setRunKey((k) => k + 1);
  }

  async function clearSaved() {
    if (saved) await clearQuizProgress(saved.id).catch(() => undefined);
    setSaved(null);
  }

  function exit() {
    setQuizData(null);
    setInitial(null);
    void loadSaved();
  }

  if (!quizData) {
    return (
      <SetupView
        error={error}
        onPasteLoad={loadText}
        onFileSelected={loadFile}
        savedQuiz={saved}
        onResume={resume}
        onClearSaved={() => void clearSaved()}
      />
    );
  }

  return (
    <QuizRunner
      key={runKey}
      quizData={quizData}
      saveId={saveId}
      source="local"
      initial={initial}
      // Local mode keeps the full questions in memory, so grading needs no server.
      onFinish={async () => quizData.questions as Question[]}
      onQuit={exit}
      exitLabel="Back to import"
    />
  );
}
