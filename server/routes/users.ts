import express from "express";
import type { Db } from "../db.ts";
import { requireMe, requireUser } from "../auth.ts";
import { HttpError } from "../http.ts";
import { CARD_SELECT, toCard, type Row } from "../cards.ts";
import type { AttemptSummary } from "../../shared/types.ts";

type UserRow = { id: number; username: string; avatar_url: string; created_at: number };
type AttemptRow = {
  id: number;
  quiz_id: number;
  title: string;
  correct: number;
  total: number;
  duration_ms: number;
  finished_at: number;
};

export function userRoutes(db: Db): express.Router {
  const r = express.Router();

  r.get("/users/:username", (req, res) => {
    const u = db
      .prepare("SELECT id, username, avatar_url, created_at FROM users WHERE username = ? COLLATE NOCASE")
      .get(String(req.params.username)) as UserRow | undefined;
    if (!u) throw new HttpError(404, "User not found");
    const rows = db.prepare(`${CARD_SELECT} WHERE q.published = 1 AND q.author_id = ? ORDER BY q.published_at DESC`).all(u.id) as Row[];
    res.json({ username: u.username, avatarUrl: u.avatar_url, createdAt: u.created_at, quizzes: rows.map(toCard) });
  });

  r.get("/me/quizzes", requireUser, (_req, res) => {
    const me = requireMe(res);
    const rows = db.prepare(`${CARD_SELECT} WHERE q.author_id = ? ORDER BY q.updated_at DESC`).all(me.id) as Row[];
    res.json({
      drafts: rows.filter((row) => !row.published).map(toCard),
      published: rows.filter((row) => row.published).map(toCard),
    });
  });

  r.get("/me/attempts", requireUser, (_req, res) => {
    const me = requireMe(res);
    const rows = db
      .prepare(
        `SELECT a.id, a.quiz_id, q.title, a.correct, a.total,
                (a.finished_at - a.started_at) AS duration_ms, a.finished_at
         FROM attempts a JOIN quizzes q ON q.id = a.quiz_id
         WHERE a.user_id = ? AND a.finished_at IS NOT NULL
         ORDER BY a.finished_at DESC, a.id DESC
         LIMIT 50`
      )
      .all(me.id) as AttemptRow[];
    const out: AttemptSummary[] = rows.map((row) => ({
      id: row.id,
      quiz: { id: row.quiz_id, title: row.title },
      correct: row.correct,
      total: row.total,
      durationMs: row.duration_ms,
      finishedAt: row.finished_at,
    }));
    res.json(out);
  });

  return r;
}
