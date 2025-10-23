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
