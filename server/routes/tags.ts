import express from "express";
import type { Db } from "../db.ts";
import type { TagCount } from "../../shared/types.ts";

export function tagRoutes(db: Db): express.Router {
  const r = express.Router();

  r.get("/tags", (req, res) => {
    const raw = typeof req.query.q === "string" ? req.query.q.trim() : "";
    // Tags only ever contain [a-z0-9-], so stripping anything else also removes LIKE wildcards.
    const q = raw.toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (raw && !q) {
      res.json([]);
      return;
    }
    const rows = db
      .prepare(
        `SELECT t.tag, COUNT(*) AS count
         FROM quiz_tags t JOIN quizzes q ON q.id = t.quiz_id
         WHERE q.published = 1 AND (? = '' OR t.tag LIKE ?)
         GROUP BY t.tag
         ORDER BY count DESC, t.tag ASC
         LIMIT 20`
      )
      .all(q, `${q}%`) as TagCount[];
    res.json(rows);
  });

  return r;
}
