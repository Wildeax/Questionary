CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY,
  github_id   INTEGER NOT NULL UNIQUE,
  username    TEXT    NOT NULL,
  avatar_url  TEXT    NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS quizzes (
  id            INTEGER PRIMARY KEY,
  author_id     INTEGER NOT NULL REFERENCES users(id),
  title         TEXT    NOT NULL,
  description   TEXT    NOT NULL DEFAULT '',
  questions     TEXT    NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  published     INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  published_at  INTEGER
);
CREATE INDEX IF NOT EXISTS quizzes_published ON quizzes(published, published_at);
CREATE INDEX IF NOT EXISTS quizzes_author    ON quizzes(author_id);

CREATE TABLE IF NOT EXISTS quiz_tags (
  quiz_id  INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  tag      TEXT    NOT NULL,
  PRIMARY KEY (quiz_id, tag)
);
CREATE INDEX IF NOT EXISTS quiz_tags_tag ON quiz_tags(tag);

CREATE TABLE IF NOT EXISTS votes (
  user_id  INTEGER NOT NULL REFERENCES users(id),
  quiz_id  INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  value    INTEGER NOT NULL CHECK (value IN (-1, 1)),
  PRIMARY KEY (user_id, quiz_id)
);

CREATE TABLE IF NOT EXISTS attempts (
  id            INTEGER PRIMARY KEY,
  quiz_id       INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  quiz_version  INTEGER NOT NULL,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  correct       INTEGER,
  total         INTEGER NOT NULL,
  started_at    INTEGER NOT NULL,
  finished_at   INTEGER,
  answers       TEXT
);
CREATE INDEX IF NOT EXISTS attempts_board ON attempts(quiz_id, quiz_version, correct, finished_at);
CREATE INDEX IF NOT EXISTS attempts_user  ON attempts(user_id, finished_at);
