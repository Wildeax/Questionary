import * as yaml from "js-yaml";
import type { Question, MCQuestion, TFQuestion, QuizData, QuizMetadata } from "./types";

// -------------------- Helpers --------------------

export function isMC(q: Question): q is MCQuestion {
  return q.type === "mc";
}

export function isTF(q: Question): q is TFQuestion {
  return q.type === "tf";
}

export function parseQuestionsFromText(text: string): QuizData {
  // Try JSON first
  try {
    const json = JSON.parse(text);
    const arr = Array.isArray(json) ? json : [json];
    return validateQuizData(arr);
  } catch (_) {
    // Fallback to YAML
    try {
      const doc = yaml.load(text);
      const arr = Array.isArray(doc) ? doc : [doc];
      return validateQuizData(arr as unknown[]);
    } catch (e) {
      throw new Error("Unable to parse as JSON or YAML. Check your syntax.");
    }
  }
}

export function validateQuizData(raw: any[]): QuizData {
  const errors: string[] = [];

  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("Document must be an array with at least metadata.");
  }

  // First item must be metadata
  const metadataItem = raw[0];
  if (!metadataItem || typeof metadataItem !== "object") {
    errors.push("First item must be metadata object.");
  } else {
    if (!metadataItem.metadata || typeof metadataItem.metadata !== "object") {
      errors.push("First item must contain a 'metadata' object.");
    } else if (!metadataItem.metadata.name || typeof metadataItem.metadata.name !== "string") {
      errors.push("Metadata must have a required 'name' field (string).");
    }
  }

  if (errors.length) {
    throw new Error(errors.join("\n"));
  }

  const metadata: QuizMetadata = {
    name: String(metadataItem.metadata.name),
    author: metadataItem.metadata.author ? String(metadataItem.metadata.author) : undefined,
  };

  // Parse questions from remaining items
  const questions: Question[] = [];
  for (let i = 1; i < raw.length; i++) {
    const q = raw[i];
    if (!q || typeof q !== "object") {
      errors.push(`Item ${i + 1} is not an object.`);
      continue;
    }
    if (!q.id || !q.type || !q.prompt) {
      errors.push(`Question ${i} missing required fields (id, type, prompt).`);
      continue;
    }

    if (q.type === "mc") {
      if (!Array.isArray(q.options) || typeof q.answer !== "number") {
        errors.push(`MC question ${i} requires options[] and numeric answer (index).`);
        continue;
      }
      if (q.answer < 0 || q.answer >= q.options.length) {
        errors.push(`MC question ${i} has answer index out of range.`);
        continue;
      }
      questions.push({
        id: String(q.id),
        type: "mc",
        prompt: String(q.prompt),
        options: q.options.map(String),
        answer: Number(q.answer),
        explanation: q.explanation ? String(q.explanation) : undefined,
      });
    } else if (q.type === "tf") {
      if (typeof q.answer !== "boolean") {
        errors.push(`TF question ${i} requires boolean answer (true/false).`);
        continue;
      }
      questions.push({
        id: String(q.id),
        type: "tf",
        prompt: String(q.prompt),
        answer: Boolean(q.answer),
        explanation: q.explanation ? String(q.explanation) : undefined,
      });
    } else {
      errors.push(`Question ${i} has unknown type '${q.type}'. Use 'mc' or 'tf'.`);
      continue;
    }
  }

  if (errors.length) {
    throw new Error(errors.join("\n"));
  }

  return { metadata, questions };
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
