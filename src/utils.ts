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
  // Check if text is empty
  if (!text || text.trim().length === 0) {
    throw new Error("File is empty. Please provide a valid JSON or YAML file with quiz questions.");
  }

  // Try JSON first
  try {
    const json = JSON.parse(text);
    const arr = Array.isArray(json) ? json : [json];
    return validateQuizData(arr);
  } catch (jsonError: any) {
    // Try YAML as fallback
    try {
      const doc = yaml.load(text);
      const arr = Array.isArray(doc) ? doc : [doc];
      return validateQuizData(arr as unknown[]);
    } catch (yamlError: any) {
      // Provide detailed error information
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
}

export function validateQuizData(raw: any[]): QuizData {
  const errors: string[] = [];

  if (!Array.isArray(raw)) {
    throw new Error("Invalid format: File must be an array of objects.\n\nFor YAML: Use '-' to start each item.\nFor JSON: Use square brackets [].");
  }

  if (raw.length === 0) {
    throw new Error("File is empty. Add at least metadata and one question.\n\nExample:\n- metadata:\n    name: \"My Quiz\"\n- id: Q1\n  type: mc\n  prompt: \"Question?\"");
  }

  // Check if first item is metadata
  const metadataItem = raw[0];
  if (!metadataItem || typeof metadataItem !== "object") {
    errors.push("❌ First item must be a metadata object, not " + (metadataItem === null ? "null" : typeof metadataItem));
    errors.push("\nCorrect format:");
    errors.push("YAML: - metadata:\n        name: \"Quiz Title\"");
    errors.push("JSON: {\"metadata\": {\"name\": \"Quiz Title\"}}");
  } else {
    // Check for metadata key
    if (!metadataItem.metadata || typeof metadataItem.metadata !== "object") {
      errors.push("❌ First item must contain a 'metadata' object.");
      errors.push("Found keys: " + (metadataItem ? Object.keys(metadataItem).join(", ") : "none"));
      errors.push("\nCorrect format:");
      errors.push("YAML: - metadata:\n        name: \"Quiz Title\"");
      errors.push("JSON: [{\"metadata\": {\"name\": \"Quiz Title\"}}]");
    } else if (!metadataItem.metadata.name || typeof metadataItem.metadata.name !== "string") {
      errors.push("❌ Metadata must have a required 'name' field (string).");
      errors.push("Current metadata: " + JSON.stringify(metadataItem.metadata, null, 2));
      errors.push("\nExample: name: \"My Quiz Title\"");
    }
  }

  if (errors.length) {
    throw new Error("Metadata validation failed:\n" + errors.join("\n"));
  }

  const metadata: QuizMetadata = {
    name: String(metadataItem.metadata.name),
    author: metadataItem.metadata.author ? String(metadataItem.metadata.author) : undefined,
  };

  // Parse questions from remaining items
  const questions: Question[] = [];
  for (let i = 1; i < raw.length; i++) {
    const q = raw[i];
    const questionNum = i; // 1-based for user display

    if (!q || typeof q !== "object") {
      errors.push(`❌ Question ${questionNum}: Must be an object, got ${q === null ? "null" : typeof q}`);
      continue;
    }

    // Check required fields
    const missingFields = [];
    if (!q.id) missingFields.push("id");
    if (!q.type) missingFields.push("type");
    if (!q.prompt) missingFields.push("prompt");

    if (missingFields.length > 0) {
      errors.push(`❌ Question ${questionNum}: Missing required fields: ${missingFields.join(", ")}`);
      errors.push(`   Found keys: ${Object.keys(q).join(", ")}`);
      continue;
    }

    // Validate question types
    if (q.type === "mc") {
      if (!Array.isArray(q.options)) {
        errors.push(`❌ MC Question ${questionNum}: 'options' must be an array`);
        errors.push(`   Example: options: ["A", "B", "C", "D"]`);
        continue;
      }
      if (q.options.length < 2) {
        errors.push(`❌ MC Question ${questionNum}: Must have at least 2 options, got ${q.options.length}`);
        continue;
      }
      if (typeof q.answer !== "number") {
        errors.push(`❌ MC Question ${questionNum}: 'answer' must be a number (index), got ${typeof q.answer}`);
        errors.push(`   Example: answer: 0  (for first option)`);
        continue;
      }
      if (q.answer < 0 || q.answer >= q.options.length) {
        errors.push(`❌ MC Question ${questionNum}: Answer index ${q.answer} is out of range. Valid range: 0-${q.options.length - 1}`);
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
        errors.push(`❌ TF Question ${questionNum}: 'answer' must be true or false, got ${q.answer} (${typeof q.answer})`);
        errors.push(`   Example: answer: true`);
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
      errors.push(`❌ Question ${questionNum}: Unknown question type '${q.type}'. Use 'mc' (multiple choice) or 'tf' (true/false)`);
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
