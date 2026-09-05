import type { Answers, PlayQuestion, Question } from "./types.ts";

export type GradeResult = {
  correct: number;
  total: number;
  perQuestion: Record<string, boolean>;
};

export function grade(questions: Question[], answers: Answers): GradeResult {
  const perQuestion: Record<string, boolean> = {};
  let correct = 0;
  for (const q of questions) {
    const a = answers[q.id];
    const ok = q.type === "mc" ? typeof a === "number" && a === q.answer : typeof a === "boolean" && a === q.answer;
    perQuestion[q.id] = ok;
    if (ok) correct++;
  }
  return { correct, total: questions.length, perQuestion };
}

export function stripAnswers(questions: Question[]): PlayQuestion[] {
  return questions.map((q) =>
    q.type === "mc"
      ? { id: q.id, type: "mc", prompt: q.prompt, options: q.options }
      : { id: q.id, type: "tf", prompt: q.prompt }
  );
}
