import express from "express";
import type { Db } from "../db.ts";
import { requireMe, requireUser } from "../auth.ts";
import { HttpError, idParam } from "../http.ts";
import { getQuizRow, type Row } from "../cards.ts";
import { grade, stripAnswers } from "../../shared/grade.ts";
import type { Answers, Question } from "../../shared/types.ts";

type AttemptRow = {
  id: number;
  quiz_id: number;
  quiz_version: number;
  user_id: number;
  started_at: number;
  finished_at: number | null;
};

function publishedQuiz(db: Db, raw: unknown): Row {
  const row = getQuizRow(db, idParam(raw));
  if (!row.published) throw new HttpError(404, "Not found");
  return row;
}

function parseAnswers(body: unknown): Answers {
  const raw = (body as { answers?: unknown } | null)?.answers;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new HttpError(400, "answers must be an object keyed by question id");
  }
  const out: Answers = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number" || typeof value === "boolean") out[key] = value;
  }
  return out;
}

function startPayload(row: Row, questions: Question[]) {
  return {
    version: row.version,
    title: row.title,
    author: { username: row.username, avatarUrl: row.avatar_url },
    questions: stripAnswers(questions),
  };
}

export function playRoutes(db: Db): express.Router {
  const r = express.Router();

  r.get("/quizzes/:id/play", (req, res) => {
    const row = publishedQuiz(db, req.params.id);
    res.json(startPayload(row, JSON.parse(row.questions) as Question[]));
  });

  r.post("/quizzes/:id/attempts", requireUser, (req, res) => {
    const me = requireMe(res);
    const row = publishedQuiz(db, req.params.id);
    const questions = JSON.parse(row.questions) as Question[];
    const attempt = db
      .prepare("INSERT INTO attempts (quiz_id, quiz_version, user_id, total, started_at) VALUES (?, ?, ?, ?, ?) RETURNING id")
      .get(row.id, row.version, me.id, questions.length, Date.now()) as { id: number };
    res.status(201).json({ attemptId: attempt.id, ...startPayload(row, questions) });
  });

  r.post("/attempts/:id", requireUser, (req, res) => {
    const me = requireMe(res);
    const attempt = db.prepare("SELECT id, quiz_id, quiz_version, user_id, started_at, finished_at FROM attempts WHERE id = ?").get(
      idParam(req.params.id)
    ) as AttemptRow | undefined;
    if (!attempt || attempt.user_id !== me.id) throw new HttpError(404, "Attempt not found");
    if (attempt.finished_at) throw new HttpError(409, "This attempt was already submitted.");
    const row = getQuizRow(db, attempt.quiz_id);
    if (row.version !== attempt.quiz_version) {
      throw new HttpError(409, "This quiz was updated by its author. Start over to play the new version.");
    }
    const answers = parseAnswers(req.body);
    const questions = JSON.parse(row.questions) as Question[];
    const result = grade(questions, answers);
    const now = Date.now();
    db.prepare("UPDATE attempts SET correct = ?, finished_at = ?, answers = ? WHERE id = ?").run(
      result.correct,
      now,
      JSON.stringify(answers),
      attempt.id
    );
    res.json({ correct: result.correct, total: result.total, durationMs: now - attempt.started_at, questions });
  });

  r.post("/quizzes/:id/grade", (req, res) => {
    const row = publishedQuiz(db, req.params.id);
    const answers = parseAnswers(req.body);
    const questions = JSON.parse(row.questions) as Question[];
    const result = grade(questions, answers);
    res.json({ correct: result.correct, total: result.total, durationMs: null, questions });
  });

  return r;
}
