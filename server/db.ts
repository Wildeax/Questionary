import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

// ponytail: node:sqlite is marked experimental on Node 22. This file is the only one
// that touches the driver, so swapping to better-sqlite3 is a one-file change.
export type Db = DatabaseSync;

export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  migrate(db);
  db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
  return db;
}

/**
 * Columns added after the first release. schema.sql only creates missing tables, so an
 * existing quizzes table gets them here, before schema.sql adds the index on translation_of.
 */
function migrate(db: Db): void {
  const columns = (db.prepare("PRAGMA table_info(quizzes)").all() as { name: string }[]).map((c) => c.name);
  if (columns.length > 0 && !columns.includes("language")) {
    db.exec("ALTER TABLE quizzes ADD COLUMN language TEXT NOT NULL DEFAULT 'en'");
    db.exec("ALTER TABLE quizzes ADD COLUMN translation_of INTEGER REFERENCES quizzes(id) ON DELETE SET NULL");
  }
}

export function tx<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
