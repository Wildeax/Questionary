export type QuizMetadata = {
  name: string;
  author?: string;
  description?: string;
  tags?: string[];
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

/** A question as sent to a player: no answer, no explanation. */
export type PlayQuestion =
  | Omit<MCQuestion, "answer" | "explanation">
  | Omit<TFQuestion, "answer" | "explanation">;

export type Answers = Record<string, number | boolean | undefined>;

export type QuizData = {
  metadata: QuizMetadata;
  questions: Question[];
};

export type PlayQuizData = {
  metadata: QuizMetadata;
  questions: PlayQuestion[];
};

export type QuizSettings = {
  randomOrder: boolean;
};

export type SavedQuizState = {
  id: string;
  source: "local" | "online";
  quizId?: number;
  attemptId?: number;
  version?: number;
  quizData: PlayQuizData;
  settings: QuizSettings;
  answers: Answers;
  currentIndex: number;
  timestamp: number;
  completed: boolean;
  questionOrder: string[];
  currentQuestionId: string | null;
};

export type QuizCard = {
  id: number;
  title: string;
  description: string;
  author: { username: string; avatarUrl: string };
  tags: string[];
  questionCount: number;
  score: number;
  plays: number;
  publishedAt: number | null;
};

export type Me = {
  id: number;
  username: string;
  avatarUrl: string;
  isAdmin: boolean;
};
