import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { openDb, tx } from "../db.ts";

describe("openDb", () => {
  it("creates the five tables", () => {
    const db = openDb(":memory:");
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((r) => r.name as string);
    assert.deepEqual(names, ["attempts", "quiz_tags", "quizzes", "users", "votes"]);
  });

  it("enforces foreign keys", () => {
    const db = openDb(":memory:");
    assert.throws(() =>
      db.prepare("INSERT INTO quizzes (author_id, title, questions, created_at, updated_at) VALUES (999, 't', '[]', 0, 0)").run()
    );
  });

  it("rolls back a failed transaction", () => {
    const db = openDb(":memory:");
    assert.throws(() =>
      tx(db, () => {
        db.prepare("INSERT INTO users (github_id, username, avatar_url, created_at) VALUES (1, 'a', '', 0)").run();
        throw new Error("boom");
      })
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users").get()!.n, 0);
  });
});
