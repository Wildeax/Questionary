import type { Db } from "./db.ts";
import { HttpError } from "./http.ts";
import type { QuizCard } from "../shared/types.ts";

// ponytail: score and plays are subselects per row. Ceiling: slow listing at tens of
// thousands of quizzes. Upgrade: counter columns kept by triggers.
export const CARD_SELECT = `
  SELECT q.id, q.title, q.description, q.published, q.version, q.author_id, q.published_at,
    q.updated_at, q.questions, u.username, u.avatar_url,
    json_array_length(q.questions) AS question_count,
    COALESCE((SELECT SUM(v.value) FROM votes v WHERE v.quiz_id = q.id), 0) AS score,
    (SELECT COUNT(*) FROM attempts a WHERE a.quiz_id = q.id AND a.finished_at IS NOT NULL) AS plays,
    COALESCE((SELECT group_concat(t.tag) FROM quiz_tags t WHERE t.quiz_id = q.id), '') AS tags
  FROM quizzes q JOIN users u ON u.id = q.author_id`;

export type Row = {
  id: number;
  title: string;
  description: string;
  published: number;
  version: number;
  author_id: number;
  published_at: number | null;
  updated_at: number;
  questions: string;
  username: string;
  avatar_url: string;
  question_count: number;
  score: number;
  plays: number;
  tags: string;
};

export function toCard(r: Row): QuizCard {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    author: { username: r.username, avatarUrl: r.avatar_url },
    tags: r.tags ? r.tags.split(",") : [],
    questionCount: r.question_count,
    score: r.score,
    plays: r.plays,
    publishedAt: r.published_at,
  };
}

export function getQuizRow(db: Db, id: number): Row {
  const row = db.prepare(`${CARD_SELECT} WHERE q.id = ?`).get(id) as Row | undefined;
  if (!row) throw new HttpError(404, "Not found");
  return row;
}

export function replaceTags(db: Db, quizId: number, tags: string[]): void {
  db.prepare("DELETE FROM quiz_tags WHERE quiz_id = ?").run(quizId);
  const insert = db.prepare("INSERT INTO quiz_tags (quiz_id, tag) VALUES (?, ?)");
  for (const tag of tags) insert.run(quizId, tag);
}
