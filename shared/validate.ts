import { load } from "js-yaml";
import type { MCQuestion, Question, QuizData, QuizMetadata, TFQuestion } from "./types.ts";

export const TAG_RE = /^[a-z0-9][a-z0-9-]{0,29}$/;
export const MAX_TAGS = 5;

export function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const tag = String(item).trim().toLowerCase().replace(/\s+/g, "-");
    if (!tag) continue;
    if (!TAG_RE.test(tag)) {
      throw new Error(`Invalid tag "${String(item)}". Use letters, numbers, and hyphens, up to 30 characters.`);
    }
    if (!out.includes(tag)) out.push(tag);
  }
  if (out.length > MAX_TAGS) throw new Error(`A quiz can have at most ${MAX_TAGS} tags.`);
  return out;
}

export function parseQuestionsFromText(text: string): QuizData {
  if (!text || text.trim().length === 0) {
    throw new Error("File is empty. Please provide a valid JSON or YAML file with quiz questions.");
  }

  let jsonError: Error;
  try {
    const json = JSON.parse(text);
    const arr = Array.isArray(json) ? json : [json];
    return validateQuizData(arr);
  } catch (e) {
    if (e instanceof SyntaxError) {
      jsonError = e;
    } else {
      throw e;
    }
  }

  try {
    const doc = load(text);
    const arr = Array.isArray(doc) ? doc : [doc];
    return validateQuizData(arr as unknown[]);
  } catch (e) {
    const yamlError = e as Error;
    if (yamlError.name !== "YAMLException") {
      // Validation error from validateQuizData, not a parse error. js-yaml names its errors YAMLException.
      throw yamlError;
    }
    let errorMessage = "Failed to parse file. ";
    if (jsonError.message.includes("Unexpected token")) {
      errorMessage += "The file appears to be YAML but has JSON-like syntax errors. ";
    } else if (jsonError.message.includes("Expected property name")) {
      errorMessage += "Invalid JSON format. Check for missing quotes or commas. ";
    }
    if (yamlError.message.includes("bad indentation")) {
      errorMessage += "YAML indentation error. Make sure all items at the same level have consistent indentation. ";
    } else if (yamlError.message.includes("duplicated mapping key")) {
      errorMessage += "YAML error: duplicate keys found. ";
    }
    errorMessage += "\n\nExpected format:\n";
    errorMessage += "YAML: Start with '- metadata:' followed by questions starting with '- id:'\n";
    errorMessage += "JSON: Array of objects starting with metadata object";
    throw new Error(errorMessage);
  }
}

export function validateQuizData(raw: unknown[]): QuizData {
  const errors: string[] = [];

  if (!Array.isArray(raw)) {
    throw new Error("Invalid format: File must be an array of objects.\n\nFor YAML: Use '-' to start each item.\nFor JSON: Use square brackets [].");
  }

  if (raw.length === 0) {
    throw new Error("File is empty. Add at least metadata and one question.\n\nExample:\n- metadata:\n    name: \"My Quiz\"\n- id: Q1\n  type: mc\n  prompt: \"Question?\"");
  }

  const metadataItem = raw[0] as { metadata?: Record<string, unknown> } | null;
  if (!metadataItem || typeof metadataItem !== "object") {
    errors.push("First item must be a metadata object, not " + (metadataItem === null ? "null" : typeof metadataItem));
    errors.push("\nCorrect format:");
    errors.push("YAML: - metadata:\n        name: \"Quiz Title\"");
    errors.push("JSON: {\"metadata\": {\"name\": \"Quiz Title\"}}");
  } else if (!metadataItem.metadata || typeof metadataItem.metadata !== "object") {
    errors.push("First item must contain a 'metadata' object.");
    errors.push("Found keys: " + Object.keys(metadataItem).join(", "));
    errors.push("\nCorrect format:");
    errors.push("YAML: - metadata:\n        name: \"Quiz Title\"");
    errors.push("JSON: [{\"metadata\": {\"name\": \"Quiz Title\"}}]");
  } else if (!metadataItem.metadata.name || typeof metadataItem.metadata.name !== "string") {
    errors.push("Metadata must have a required 'name' field (string).");
    errors.push("Current metadata: " + JSON.stringify(metadataItem.metadata, null, 2));
    errors.push("\nExample: name: \"My Quiz Title\"");
  }

  if (errors.length) {
    throw new Error("Metadata validation failed:\n" + errors.join("\n"));
  }

  const md = (metadataItem as { metadata: Record<string, unknown> }).metadata;
  const metadata: QuizMetadata = {
    name: String(md.name).trim(),
    author: md.author ? String(md.author) : undefined,
    description: md.description ? String(md.description) : undefined,
    tags: Array.isArray(md.tags) ? normalizeTags(md.tags) : undefined,
  };

  const questions: Question[] = [];
  for (let i = 1; i < raw.length; i++) {
    const q = raw[i] as Record<string, unknown> | null;
    const questionNum = i;

    if (!q || typeof q !== "object") {
      errors.push(`Question ${questionNum}: Must be an object, got ${q === null ? "null" : typeof q}`);
      continue;
    }

    const missingFields: string[] = [];
    if (!q.id) missingFields.push("id");
    if (!q.type) missingFields.push("type");
    if (!q.prompt) missingFields.push("prompt");
    if (missingFields.length > 0) {
      errors.push(`Question ${questionNum}: Missing required fields: ${missingFields.join(", ")}`);
      errors.push(`   Found keys: ${Object.keys(q).join(", ")}`);
      continue;
    }

    if (questions.some((existing) => existing.id === String(q.id))) {
      errors.push(`Question ${questionNum}: duplicate id '${String(q.id)}'. Ids must be unique.`);
      continue;
    }

    if (q.type === "mc") {
      if (!Array.isArray(q.options)) {
        errors.push(`MC Question ${questionNum}: 'options' must be an array`);
        errors.push(`   Example: options: ["A", "B", "C", "D"]`);
        continue;
      }
      if (q.options.length < 2) {
        errors.push(`MC Question ${questionNum}: Must have at least 2 options, got ${q.options.length}`);
        continue;
      }
      if (typeof q.answer !== "number") {
        errors.push(`MC Question ${questionNum}: 'answer' must be a number (index), got ${typeof q.answer}`);
        errors.push(`   Example: answer: 0  (for first option)`);
        continue;
      }
      if (q.answer < 0 || q.answer >= q.options.length) {
        errors.push(`MC Question ${questionNum}: Answer index ${q.answer} is out of range. Valid range: 0-${q.options.length - 1}`);
        continue;
      }
      const mc: MCQuestion = {
        id: String(q.id),
        type: "mc",
        prompt: String(q.prompt),
        options: q.options.map(String),
        answer: Number(q.answer),
        explanation: q.explanation ? String(q.explanation) : undefined,
      };
      questions.push(mc);
    } else if (q.type === "tf") {
      if (typeof q.answer !== "boolean") {
        errors.push(`TF Question ${questionNum}: 'answer' must be true or false, got ${String(q.answer)} (${typeof q.answer})`);
        errors.push(`   Example: answer: true`);
        continue;
      }
      const tf: TFQuestion = {
        id: String(q.id),
        type: "tf",
        prompt: String(q.prompt),
        answer: Boolean(q.answer),
        explanation: q.explanation ? String(q.explanation) : undefined,
      };
      questions.push(tf);
    } else {
      errors.push(`Question ${questionNum}: Unknown question type '${String(q.type)}'. Use 'mc' (multiple choice) or 'tf' (true/false)`);
      continue;
    }
  }

  if (errors.length) {
    throw new Error(`Question validation failed (${errors.length} errors):\n` + errors.join("\n\n"));
  }

  if (questions.length === 0) {
    throw new Error("No valid questions found after metadata.\n\nAdd questions like:\n- id: Q1\n  type: mc\n  prompt: \"Question?\"\n  options: [\"A\", \"B\"]\n  answer: 0");
  }

  return { metadata, questions };
}

export type QuizInput = {
  title: string;
  description: string;
  tags: string[];
  questions: Question[];
};

/** Validates a publish body from the browser. Throws an Error with a user-facing message. */
export function validateQuizInput(body: unknown): QuizInput {
  if (!body || typeof body !== "object") throw new Error("Request body must be an object.");
  const b = body as Record<string, unknown>;
  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (title.length < 1 || title.length > 120) throw new Error("Title must be 1 to 120 characters.");
  const description = typeof b.description === "string" ? b.description.trim() : "";
  if (description.length > 1000) throw new Error("Description must be at most 1000 characters.");
  const tags = normalizeTags(b.tags ?? []);
  if (!Array.isArray(b.questions)) throw new Error("questions must be an array.");
  const { questions } = validateQuizData([{ metadata: { name: title } }, ...b.questions]);
  return { title, description, tags, questions };
}
