import express from "express";
import type { Db } from "../db.ts";
import { requireMe, requireUser } from "../auth.ts";
import { HttpError } from "../http.ts";
import { CARD_SELECT, toCard, type Row } from "../cards.ts";

type UserRow = { id: number; username: string; avatar_url: string; created_at: number };

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

  return r;
}
