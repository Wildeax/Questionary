import type { Question, QuestionaryMeta } from "./types";

const QUESTIONARY_STORAGE_KEY = "questionary_app_state_v1";

// Storage interface for quiz state
export interface QuizState {
  view: "setup" | "settings" | "quiz" | "results";
  questions: Question[];
  meta: QuestionaryMeta | null;
  currentIndex: number;
  answers: Record<string, number | boolean | undefined>;
  timestamp: number;
}

// Save quiz state to localStorage
export function saveQuizState(state: QuizState): void {
  try {
    localStorage.setItem(QUESTIONARY_STORAGE_KEY, JSON.stringify({
      ...state,
      timestamp: Date.now()
    }));
  } catch (error) {
    console.warn("Failed to save quiz state to localStorage:", error);
  }
}

// Load quiz state from localStorage
export function loadQuizState(): QuizState | null {
  try {
    const stored = localStorage.getItem(QUESTIONARY_STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as QuizState & { timestamp: number };

    // Check if data is from today (within 24 hours)
    const isRecent = Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000;
    if (!isRecent) {
      localStorage.removeItem(QUESTIONARY_STORAGE_KEY);
      return null;
    }

    return {
      ...parsed,
      meta: parsed.meta ?? null,
    };
  } catch (error) {
    console.warn("Failed to load quiz state from localStorage:", error);
    return null;
  }
}

// Clear quiz state from localStorage
export function clearQuizState(): void {
  try {
    localStorage.removeItem(QUESTIONARY_STORAGE_KEY);
  } catch (error) {
    console.warn("Failed to clear quiz state from localStorage:", error);
  }
}

// Check if there's a saved quiz state
export function hasSavedQuizState(): boolean {
  return loadQuizState() !== null;
}
