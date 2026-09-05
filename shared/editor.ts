import type { MCQuestion, Question } from "./types.ts";

export function questionId(index: number): string {
  return `Q${String(index + 1).padStart(3, "0")}`;
}

/** Ids follow position: Q001, Q002, ... */
export function renumber(questions: Question[]): Question[] {
  return questions.map((q, i) => ({ ...q, id: questionId(i) }));
}

export function blankQuestion(index: number): MCQuestion {
  return { id: questionId(index), type: "mc", prompt: "", options: ["", ""], answer: 0 };
}

/** Changes a question's type. Keeps id, prompt, and explanation; the answer starts over. */
export function switchType(q: Question, type: "mc" | "tf"): Question {
  if (q.type === type) return q;
  const base = { id: q.id, prompt: q.prompt, explanation: q.explanation };
  return type === "mc" ? { ...base, type: "mc", options: ["", ""], answer: 0 } : { ...base, type: "tf", answer: true };
}

/** Moves the item at `from` by `delta` positions, clamped to the array. Returns the same array when nothing moves. */
export function move<T>(items: T[], from: number, delta: number): T[] {
  const to = Math.min(Math.max(from + delta, 0), items.length - 1);
  if (to === from) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function withOption(q: MCQuestion, index: number, text: string): MCQuestion {
  return { ...q, options: q.options.map((o, i) => (i === index ? text : o)) };
}

export function addOption(q: MCQuestion): MCQuestion {
  return { ...q, options: [...q.options, ""] };
}

/** Drops an option and keeps `answer` on the same text. Refuses to go below two options. */
export function removeOption(q: MCQuestion, index: number): MCQuestion {
  if (q.options.length <= 2) return q;
  const options = q.options.filter((_, i) => i !== index);
  const answer = q.answer === index ? 0 : q.answer > index ? q.answer - 1 : q.answer;
  return { ...q, options, answer };
}
