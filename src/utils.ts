import * as yaml from "js-yaml";
import type { Question, MCQuestion, TFQuestion } from "./types";

// -------------------- Helpers --------------------

export function isMC(q: Question): q is MCQuestion {
  return q.type === "mc";
}

export function isTF(q: Question): q is TFQuestion {
  return q.type === "tf";
}

export function parseQuestionsFromText(text: string): Question[] {
  // Try JSON first
  try {
    const json = JSON.parse(text);
    const arr = Array.isArray(json) ? json : [json];
    return validateQuestions(arr);
  } catch (_) {
    // Fallback to YAML
    try {
      const doc = yaml.load(text);
      const arr = Array.isArray(doc) ? doc : [doc];
      return validateQuestions(arr as unknown[]);
    } catch (e) {
      throw new Error("Unable to parse as JSON or YAML. Check your syntax.");
    }
  }
}

export function validateQuestions(raw: any[]): Question[] {
  const errors: string[] = [];
  const out: Question[] = [];

  raw.forEach((q, i) => {
    if (!q || typeof q !== "object") {
      errors.push(`Item ${i + 1} is not an object.`);
      return;
    }
    if (!q.id || !q.type || !q.prompt) {
      errors.push(`Item ${i + 1} missing required fields (id, type, prompt).`);
      return;
    }

    if (q.type === "mc") {
      if (!Array.isArray(q.options) || typeof q.answer !== "number") {
        errors.push(`MC item ${i + 1} requires options[] and numeric answer (index).`);
        return;
      }
      if (q.answer < 0 || q.answer >= q.options.length) {
        errors.push(`MC item ${i + 1} has answer index out of range.`);
        return;
      }
      out.push({
        id: String(q.id),
        type: "mc",
        prompt: String(q.prompt),
        options: q.options.map(String),
        answer: Number(q.answer),
        explanation: q.explanation ? String(q.explanation) : undefined,
      });
    } else if (q.type === "tf") {
      if (typeof q.answer !== "boolean") {
        errors.push(`TF item ${i + 1} requires boolean answer (true/false).`);
        return;
      }
      out.push({
        id: String(q.id),
        type: "tf",
        prompt: String(q.prompt),
        answer: Boolean(q.answer),
        explanation: q.explanation ? String(q.explanation) : undefined,
      });
    } else {
      errors.push(`Item ${i + 1} has unknown type '${q.type}'. Use 'mc' or 'tf'.`);
      return;
    }
  });

  if (errors.length) {
    throw new Error(errors.join("\n"));
  }
  return out;
}

export function formatCorrectAnswer(q: Question): string {
  if (isMC(q)) return q.options[q.answer];
  return q.answer ? "True" : "False";
}

export function formatUserAnswer(q: Question, value: number | boolean | undefined): string {
  if (value === undefined) return "—";
  if (isMC(q)) {
    if (typeof value !== "number") return "—";
    return q.options[value] ?? "—";
  }
  return value ? "True" : "False";
}
