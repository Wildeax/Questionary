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

export type LeaderboardEntry = {
  username: string;
  avatarUrl: string;
  correct: number;
  total: number;
  durationMs: number;
  finishedAt: number;
};

export type BestAttempt = {
  correct: number;
  total: number;
  durationMs: number;
};

export type TagCount = {
  tag: string;
  count: number;
};

export type AttemptSummary = {
  id: number;
  quiz: { id: number; title: string };
  correct: number;
  total: number;
  durationMs: number;
  finishedAt: number;
};

export type RoomMode = "race" | "sync";
export type RoomState = "lobby" | "countdown" | "running" | "question" | "reveal" | "finished";

export type RoomPlayerView = {
  id: string;
  nickname: string;
  answered: number;
  finished: boolean;
  correct?: number;
  durationMs?: number;
  points?: number;
  lastPoints?: number;
};

export type RoomQuestionView = {
  index: number;
  id: string;
  prompt: string;
  type: "mc" | "tf";
  options?: string[];
  endsAt: number;
};

export type RoomSnapshot = {
  code: string;
  mode: RoomMode;
  state: RoomState;
  questionSeconds: number;
  quiz: { id: number; title: string; questionCount: number };
  host: string;
  you: { id: string; isHost: boolean; answered: string[] } | null;
  players: RoomPlayerView[];
  countdownEndsAt?: number;
  question?: RoomQuestionView;
  reveal?: { questionId: string; answer: number | boolean; explanation?: string; scoreboard: RoomPlayerView[] };
  ranking?: RoomPlayerView[];
};
