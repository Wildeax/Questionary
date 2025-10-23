// -------------------- Types --------------------

export type QuizMetadata = {
  name: string;
  author?: string;
};

export type BaseQuestion = {
  id: string;
  prompt: string;
  explanation?: string;
};

export type MCQuestion = BaseQuestion & {
  type: "mc";
  options: string[];
  answer: number; // index in options
};

export type TFQuestion = BaseQuestion & {
  type: "tf";
  answer: boolean;
};

export type Question = MCQuestion | TFQuestion;

export type QuizData = {
  metadata: QuizMetadata;
  questions: Question[];
};

export type QuizSettings = {
  randomOrder: boolean;
};

export interface SavedQuizState {
  id: string; // Unique identifier
  quizData: QuizData; // Full quiz data
  settings: QuizSettings; // Quiz settings
  answers: Record<string, number | boolean | undefined>; // User answers
  currentIndex: number; // Current question index
  timestamp: number; // When saved
  completed: boolean; // Whether quiz is completed
  questionOrder?: string[]; // Order in which questions were presented
  currentQuestionId?: string | null; // Question shown when the quiz was saved
  orderedQuestions?: Question[]; // Snapshot of displayed order
}
