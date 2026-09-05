import type { Question, QuizMetadata } from "./types.ts";

/** The quiz file shape: metadata first, then the questions. Empty optional fields are left out. */
export function quizDocument(metadata: QuizMetadata, questions: Question[]): unknown[] {
  const head: Record<string, unknown> = { name: metadata.name };
  if (metadata.author) head.author = metadata.author;
  if (metadata.description) head.description = metadata.description;
  if (metadata.tags && metadata.tags.length) head.tags = metadata.tags;
  if (metadata.language) head.language = metadata.language;
  return [{ metadata: head }, ...questions];
}

/** "Unity: Basics!" -> "unity-basics". Falls back to "quiz". */
export function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "quiz";
}
