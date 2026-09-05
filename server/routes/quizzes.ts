import express from "express";
import { dump } from "js-yaml";
import { tx, type Db } from "../db.ts";
import { getUser, requireMe, requireUser } from "../auth.ts";
import { HttpError, idParam } from "../http.ts";
import { CARD_SELECT, getQuizRow, replaceTags, toCard, type Row } from "../cards.ts";
import { validateQuizInput, type QuizInput } from "../../shared/validate.ts";
import type { Question } from "../../shared/types.ts";

export const PAGE_SIZE = 20;

// q.id DESC breaks ties: quizzes published in the same millisecond would otherwise
// come back in undefined order and paginate inconsistently.
const SORTS: Record<string, string> = {
  top: "score DESC, plays DESC, q.published_at DESC, q.id DESC",
  new: "q.published_at DESC, q.id DESC",
  popular: "plays DESC, q.published_at DESC, q.id DESC",
};

function parseInput(body: unknown): QuizInput {
  try {
    return validateQuizInput(body);
  } catch (err) {
    throw new HttpError(400, (err as Error).message);
  }
}

/** Author may do anything to their quiz. Admin may act on published quizzes. Others see a draft as 404. */
function authorize(row: Row, me: { id: number; isAdmin: boolean }, adminAllowed: boolean): void {
  if (row.author_id === me.id) return;
  if (!row.published) throw new HttpError(404, "Not found");
  if (adminAllowed && me.isAdmin) return;
  throw new HttpError(403, "Only the author can do that");
}

export function quizRoutes(db: Db): express.Router {
  const r = express.Router();

  r.get("/quizzes", (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const tag = typeof req.query.tag === "string" ? req.query.tag.trim().toLowerCase() : "";
    const sortKey = String(req.query.sort ?? "top");
    const sort = Object.hasOwn(SORTS, sortKey) ? SORTS[sortKey] : SORTS.top;
    const page = Math.max(1, Math.floor(Number(req.query.page)) || 1);
    // ponytail: LIKE '%q%' search, full scan, no ranking. Upgrade: FTS5 on title and description.
    const rows = db
      .prepare(
        `${CARD_SELECT}
         WHERE q.published = 1
           AND (? = '' OR q.title LIKE ? OR q.description LIKE ?)
           AND (? = '' OR EXISTS (SELECT 1 FROM quiz_tags t WHERE t.quiz_id = q.id AND t.tag = ?))
         ORDER BY ${sort}
         LIMIT ? OFFSET ?`
      )
      .all(q, `%${q}%`, `%${q}%`, tag, tag, PAGE_SIZE + 1, (page - 1) * PAGE_SIZE) as Row[];
    res.json({ items: rows.slice(0, PAGE_SIZE).map(toCard), page, hasMore: rows.length > PAGE_SIZE });
  });

  r.post("/quizzes", requireUser, (req, res) => {
    const me = requireMe(res);
    const input = parseInput(req.body);
    const now = Date.now();
    const id = tx(db, () => {
      const row = db
        .prepare(
          "INSERT INTO quizzes (author_id, title, description, questions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id"
        )
        .get(me.id, input.title, input.description, JSON.stringify(input.questions), now, now) as { id: number };
      replaceTags(db, row.id, input.tags);
      return row.id;
    });
    res.status(201).json({ id });
  });

  r.get("/quizzes/:id", (req, res) => {
    const row = getQuizRow(db, idParam(req.params.id));
    const me = getUser(res);
    const isAuthor = me?.id === row.author_id;
    if (!row.published && !isAuthor) throw new HttpError(404, "Not found");
    const card = toCard(row);
    if (isAuthor) {
      res.json({ ...card, questions: JSON.parse(row.questions) as Question[], published: row.published === 1, version: row.version });
      return;
    }
    res.json(card);
  });

  r.put("/quizzes/:id", requireUser, (req, res) => {
    const me = requireMe(res);
    const row = getQuizRow(db, idParam(req.params.id));
    authorize(row, me, false);
    const input = parseInput(req.body);
    const questionsJson = JSON.stringify(input.questions);
    const bump = row.published === 1 && questionsJson !== row.questions ? 1 : 0;
    tx(db, () => {
      db.prepare(
        "UPDATE quizzes SET title = ?, description = ?, questions = ?, version = version + ?, updated_at = ? WHERE id = ?"
      ).run(input.title, input.description, questionsJson, bump, Date.now(), row.id);
      replaceTags(db, row.id, input.tags);
    });
    res.json({ id: row.id, version: row.version + bump });
  });

  r.delete("/quizzes/:id", requireUser, (req, res) => {
    const me = requireMe(res);
    const row = getQuizRow(db, idParam(req.params.id));
    authorize(row, me, true);
    db.prepare("DELETE FROM quizzes WHERE id = ?").run(row.id);
    res.json({ ok: true });
  });

  r.post("/quizzes/:id/publish", requireUser, (req, res) => {
    const me = requireMe(res);
    const row = getQuizRow(db, idParam(req.params.id));
    authorize(row, me, false);
    db.prepare("UPDATE quizzes SET published = 1, published_at = COALESCE(published_at, ?), updated_at = ? WHERE id = ?").run(
      Date.now(),
      Date.now(),
      row.id
    );
    res.json({ ok: true });
  });

  r.post("/quizzes/:id/unpublish", requireUser, (req, res) => {
    const me = requireMe(res);
    const row = getQuizRow(db, idParam(req.params.id));
    authorize(row, me, true);
    db.prepare("UPDATE quizzes SET published = 0, updated_at = ? WHERE id = ?").run(Date.now(), row.id);
    res.json({ ok: true });
  });

  r.get("/quizzes/:id/export", requireUser, (req, res) => {
    const me = requireMe(res);
    const row = getQuizRow(db, idParam(req.params.id));
    authorize(row, me, false);
    const tags = row.tags ? row.tags.split(",") : [];
    const metadata: Record<string, unknown> = { name: row.title, author: row.username };
    if (row.description) metadata.description = row.description;
    if (tags.length) metadata.tags = tags;
    const doc = [{ metadata }, ...(JSON.parse(row.questions) as Question[])];
    const filename = row.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "quiz";
    res.setHeader("Content-Type", "application/yaml; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}.yaml"`);
    res.send(dump(doc, { lineWidth: -1 }));
  });

  return r;
}
