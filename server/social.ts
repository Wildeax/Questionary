import type { Db } from "./db.ts";
import type { BestAttempt, LeaderboardEntry } from "../shared/types.ts";

// Best attempt first: most correct, then fastest, then earliest finish, then id breaks any remaining tie.
const BEST_ORDER = "correct DESC, (finished_at - started_at) ASC, finished_at ASC, id ASC";

type BoardRow = {
  username: string;
  avatar_url: string;
  correct: number;
  total: number;
  duration_ms: number;
  finished_at: number;
};

/** Top 10 for the given quiz version, one row per user (that user's best attempt). */
export function leaderboardFor(db: Db, quizId: number, version: number): LeaderboardEntry[] {
  const rows = db
    .prepare(
      `SELECT u.username, u.avatar_url, a.correct, a.total,
              (a.finished_at - a.started_at) AS duration_ms, a.finished_at
       FROM attempts a JOIN users u ON u.id = a.user_id
       WHERE a.quiz_id = ? AND a.quiz_version = ? AND a.finished_at IS NOT NULL
         AND a.id = (SELECT b.id FROM attempts b
                     WHERE b.quiz_id = a.quiz_id AND b.quiz_version = a.quiz_version
                       AND b.user_id = a.user_id AND b.finished_at IS NOT NULL
                     ORDER BY ${BEST_ORDER} LIMIT 1)
       ORDER BY a.correct DESC, duration_ms ASC, a.finished_at ASC, a.id ASC
       LIMIT 10`
    )
    .all(quizId, version) as BoardRow[];
  return rows.map((r) => ({
    username: r.username,
    avatarUrl: r.avatar_url,
    correct: r.correct,
    total: r.total,
    durationMs: r.duration_ms,
    finishedAt: r.finished_at,
  }));
}

export function bestFor(db: Db, quizId: number, version: number, userId: number): BestAttempt | null {
  const r = db
    .prepare(
      `SELECT correct, total, (finished_at - started_at) AS duration_ms
       FROM attempts
       WHERE quiz_id = ? AND quiz_version = ? AND user_id = ? AND finished_at IS NOT NULL
       ORDER BY ${BEST_ORDER} LIMIT 1`
    )
    .get(quizId, version, userId) as { correct: number; total: number; duration_ms: number } | undefined;
  return r ? { correct: r.correct, total: r.total, durationMs: r.duration_ms } : null;
}

export function voteOf(db: Db, quizId: number, userId: number): number {
  const r = db.prepare("SELECT value FROM votes WHERE quiz_id = ? AND user_id = ?").get(quizId, userId) as
    | { value: number }
    | undefined;
  return r?.value ?? 0;
}

export function scoreOf(db: Db, quizId: number): number {
  const r = db.prepare("SELECT COALESCE(SUM(value), 0) AS score FROM votes WHERE quiz_id = ?").get(quizId) as { score: number };
  return r.score;
}
