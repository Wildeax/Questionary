import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  it("adds the language columns to a database created before translations existed", () => {
    const path = join(tmpdir(), `questionary-migrate-${process.pid}-${Date.now()}.db`);
    const old = new DatabaseSync(path);
    old.exec(
      "CREATE TABLE users (id INTEGER PRIMARY KEY, github_id INTEGER NOT NULL UNIQUE, username TEXT NOT NULL, avatar_url TEXT NOT NULL, created_at INTEGER NOT NULL)"
    );
    old.exec(
      "CREATE TABLE quizzes (id INTEGER PRIMARY KEY, author_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', questions TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, published INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, published_at INTEGER)"
    );
    old.exec("INSERT INTO users (github_id, username, avatar_url, created_at) VALUES (1, 'a', '', 0)");
    old.exec("INSERT INTO quizzes (author_id, title, questions, created_at, updated_at) VALUES (1, 't', '[]', 0, 0)");
    old.close();
    const db = openDb(path);
    const row = db.prepare("SELECT language, translation_of FROM quizzes").get()!;
    assert.equal(row.language, "en");
    assert.equal(row.translation_of, null);
    const index = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'quizzes_translation'").all();
    assert.equal(index.length, 1);
    db.close();
    for (const f of [path, `${path}-wal`, `${path}-shm`]) rmSync(f, { force: true });
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
