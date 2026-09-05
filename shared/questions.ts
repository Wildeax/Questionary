import type { PlayQuestion, Question } from "./types.ts";

export function isMC<T extends PlayQuestion>(q: T): q is Extract<T, { type: "mc" }> {
  return q.type === "mc";
}

export function isTF<T extends PlayQuestion>(q: T): q is Extract<T, { type: "tf" }> {
  return q.type === "tf";
}

export function formatCorrectAnswer(q: Question): string {
  if (isMC(q)) return q.options[q.answer];
  return q.answer ? "True" : "False";
}

export function formatUserAnswer(q: PlayQuestion, value: number | boolean | undefined): string {
  if (value === undefined) return "—";
  if (isMC(q)) {
    if (typeof value !== "number") return "—";
    return q.options[value] ?? "—";
  }
  return value ? "True" : "False";
}
