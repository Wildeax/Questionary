# Phase 2: Votes, Tags, Leaderboard, History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let signed-in users vote quizzes up or down, tag quizzes with autocomplete and filter the catalog by tag, compete on a per-quiz leaderboard scoped to the current quiz version, and see their own attempt history.

**Architecture:** Four new API routes and three new fields on the quiz detail response, all backed by the tables that already exist (`votes`, `quiz_tags`, `attempts`). The leaderboard query picks the best finished attempt per user for the current version. The frontend adds vote buttons and a leaderboard to the quiz page, tag chips to the catalog, a tag input with suggestions to the publish page, and a history section to the my-quizzes page.

**Tech Stack:** Same as phase 1: Node 22, Express 5, `node:sqlite`, `node:test`, React 18, react-router 7, Tailwind 3, TypeScript 5.9.

**Spec:** `docs/superpowers/specs/2026-09-04-community-quizzes-design.md` (sections 3 phase 2, 7, 10, 12).

## Global Constraints

- Node runs `.ts` directly. Inside `server/` and `shared/`, every relative import uses an explicit `.ts` extension, and every type-only import uses `import type` or `import { type X }`. No enums, no namespaces, no constructor parameter properties.
- No new dependencies of any kind.
- Import Express as `import express from "express"` and use `express.Router()`.
- All timestamps are Unix milliseconds. Durations are `finished_at - started_at` in milliseconds.
- API errors are `{ "error": "message" }`.
- Server tests use `node:test` and `fetch` against the app on port 0 through `server/test/helpers.ts` (`startServer`, `asUser`, `api`, `sampleQuestions`). No test framework.
- Leaderboard order everywhere: `correct DESC, duration ASC, finished_at ASC`. Only finished attempts on the quiz's current `version` count. One row per user, that user's best attempt by the same order.
- Vote values are exactly `1`, `-1`, or `0` (0 deletes the row). Authors cannot vote on their own quiz (403). Only published quizzes accept votes (drafts 404).
- Tags are the same normalized form as phase 1 (`normalizeTags` in `shared/validate.ts`, at most `MAX_TAGS` = 5).
- The frontend keeps the phase 1 patterns: `ErrorBox` for errors, `alive` flags on fetch effects, imports with explicit extensions, react-router 7 from `"react-router"`.
- Commit messages: imperative subject, no prefix. End every commit message with:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BxXovJBHEBSQVrspo5Wc4G
  ```
- Work continues on the `community` branch.
- Prose in comments and docs: no em dashes, say what the code does.

---

## File structure

```
shared/types.ts              add LeaderboardEntry, BestAttempt, TagCount, AttemptSummary
server/social.ts             new: leaderboardFor, bestFor, voteOf, scoreOf (SQL only)
server/routes/quizzes.ts     GET /quizzes/:id gains version, myVote, leaderboard, myBest;
                             new PUT /quizzes/:id/vote, GET /quizzes/:id/leaderboard
server/routes/tags.ts        new: GET /tags?q=
server/routes/users.ts       new GET /me/attempts
server/app.ts                mount tagRoutes
server/test/social.test.ts   votes, leaderboard, quiz detail fields
server/test/tags.test.ts     tags and attempt history

src/api.ts                   vote, getTags, getMyAttempts; QuizDetail gains the new fields
src/format.ts                new: formatDuration
src/components/TagInput.tsx  new
src/pages/Quiz.tsx           vote buttons, leaderboard, my best
src/pages/Catalog.tsx        tag chips
src/pages/Publish.tsx        TagInput
src/pages/Me.tsx             history section
README.md                    one feature sentence
```

---

### Task 1: Votes and leaderboard routes

**Files:**
- Create: `server/social.ts`, `server/test/social.test.ts`
- Modify: `shared/types.ts`, `server/routes/quizzes.ts`

**Interfaces:**
- Consumes: `getQuizRow`, `idParam`, `HttpError`, `getUser`, `requireUser`, `requireMe`, `toCard`, test helpers.
- Produces: `leaderboardFor(db, quizId, version): LeaderboardEntry[]`, `bestFor(db, quizId, version, userId): BestAttempt | null`, `voteOf(db, quizId, userId): number`, `scoreOf(db, quizId): number`. `GET /api/quizzes/:id` now always includes `version`, `myVote`, `leaderboard`, `myBest`. `PUT /api/quizzes/:id/vote` returns `{ score, myVote }`. `GET /api/quizzes/:id/leaderboard` returns `LeaderboardEntry[]`.

- [ ] **Step 1: Add the shared types**

Append to `shared/types.ts`:

```ts
export type LeaderboardEntry = {
  username: string;
  avatarUrl: string;
  correct: number;
  total: number;
  durationMs: number;
  finishedAt: number;
};

export type BestAttempt = {
  correct: number;
  total: number;
  durationMs: number;
};

export type TagCount = {
  tag: string;
  count: number;
};

export type AttemptSummary = {
  id: number;
  quiz: { id: number; title: string };
  correct: number;
  total: number;
  durationMs: number;
  finishedAt: number;
};
```

- [ ] **Step 2: Write the failing test**

Create `server/test/social.test.ts`:

```ts
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { api, asUser, sampleQuestions, startServer, type TestServer } from "./helpers.ts";

type User = { id: number; cookie: string };

async function playThrough(t: TestServer, user: User, quizId: number, answers: Record<string, number | boolean>, startedAgoMs = 0) {
  const start = await api(t.base, "POST", `/api/quizzes/${quizId}/attempts`, undefined, user.cookie);
  assert.equal(start.status, 201);
  if (startedAgoMs > 0) {
    t.db.prepare("UPDATE attempts SET started_at = started_at - ? WHERE id = ?").run(startedAgoMs, start.json.attemptId);
  }
  const submit = await api(t.base, "POST", `/api/attempts/${start.json.attemptId}`, { answers }, user.cookie);
  assert.equal(submit.status, 200);
  return submit.json;
}

describe("votes", () => {
  let t: TestServer;
  let alice: User, bob: User, carol: User;
  let id: number;
  let draftId: number;
  before(async () => {
    t = await startServer();
    alice = asUser(t.db, "alice");
    bob = asUser(t.db, "bob");
    carol = asUser(t.db, "carol");
    const r = await api(t.base, "POST", "/api/quizzes", { title: "Votes", questions: sampleQuestions }, alice.cookie);
    id = r.json.id;
    await api(t.base, "POST", `/api/quizzes/${id}/publish`, undefined, alice.cookie);
    const d = await api(t.base, "POST", "/api/quizzes", { title: "Draft", questions: sampleQuestions }, alice.cookie);
    draftId = d.json.id;
  });
  after(() => t.close());

  it("requires sign-in", async () => {
    const r = await api(t.base, "PUT", `/api/quizzes/${id}/vote`, { value: 1 });
    assert.equal(r.status, 401);
  });

  it("rejects the author voting on their own quiz", async () => {
    const r = await api(t.base, "PUT", `/api/quizzes/${id}/vote`, { value: 1 }, alice.cookie);
    assert.equal(r.status, 403);
  });

  it("hides drafts", async () => {
    const r = await api(t.base, "PUT", `/api/quizzes/${draftId}/vote`, { value: 1 }, bob.cookie);
    assert.equal(r.status, 404);
  });

  it("rejects values other than 1, -1, 0", async () => {
    const r = await api(t.base, "PUT", `/api/quizzes/${id}/vote`, { value: 5 }, bob.cookie);
    assert.equal(r.status, 400);
  });

  it("counts, changes, and clears votes", async () => {
    const up = await api(t.base, "PUT", `/api/quizzes/${id}/vote`, { value: 1 }, bob.cookie);
    assert.deepEqual(up.json, { score: 1, myVote: 1 });
    const down = await api(t.base, "PUT", `/api/quizzes/${id}/vote`, { value: -1 }, carol.cookie);
    assert.deepEqual(down.json, { score: 0, myVote: -1 });
    const again = await api(t.base, "PUT", `/api/quizzes/${id}/vote`, { value: 1 }, bob.cookie);
    assert.deepEqual(again.json, { score: 0, myVote: 1 });
    const clear = await api(t.base, "PUT", `/api/quizzes/${id}/vote`, { value: 0 }, bob.cookie);
    assert.deepEqual(clear.json, { score: -1, myVote: 0 });
    const asBob = await api(t.base, "GET", `/api/quizzes/${id}`, undefined, bob.cookie);
    assert.equal(asBob.json.myVote, 0);
    assert.equal(asBob.json.score, -1);
    const asCarol = await api(t.base, "GET", `/api/quizzes/${id}`, undefined, carol.cookie);
    assert.equal(asCarol.json.myVote, -1);
    const anon = await api(t.base, "GET", `/api/quizzes/${id}`);
    assert.equal(anon.json.myVote, 0);
    assert.equal(anon.json.version, 1);
  });
});

describe("leaderboard", () => {
  let t: TestServer;
  let alice: User, bob: User, carol: User, dave: User;
  let id: number;
  before(async () => {
    t = await startServer();
    alice = asUser(t.db, "alice");
    bob = asUser(t.db, "bob");
    carol = asUser(t.db, "carol");
    dave = asUser(t.db, "dave");
    const r = await api(t.base, "POST", "/api/quizzes", { title: "Board", questions: sampleQuestions }, alice.cookie);
    id = r.json.id;
    await api(t.base, "POST", `/api/quizzes/${id}/publish`, undefined, alice.cookie);
  });
  after(() => t.close());

  it("is empty before anyone finishes", async () => {
    const r = await api(t.base, "GET", `/api/quizzes/${id}/leaderboard`);
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, []);
    const detail = await api(t.base, "GET", `/api/quizzes/${id}`, undefined, bob.cookie);
    assert.deepEqual(detail.json.leaderboard, []);
    assert.equal(detail.json.myBest, null);
  });

  it("orders by correct, then shorter duration, and keeps one row per user", async () => {
    await playThrough(t, bob, id, { Q1: 1, Q2: true });
    await playThrough(t, carol, id, { Q1: 1, Q2: false });
    await playThrough(t, dave, id, { Q1: 1, Q2: true }, 60_000);
    await playThrough(t, carol, id, { Q1: 1, Q2: true }, 30_000);
    const r = await api(t.base, "GET", `/api/quizzes/${id}/leaderboard`);
    const names = r.json.map((e: { username: string }) => e.username);
    assert.deepEqual(names, ["bob", "carol", "dave"]);
    assert.equal(r.json[1].correct, 2);
    assert.ok(r.json[1].durationMs >= 30_000 && r.json[1].durationMs < 60_000);
    assert.equal(typeof r.json[0].avatarUrl, "string");
    assert.equal(typeof r.json[0].finishedAt, "number");
  });

  it("reports my best and the board on the quiz detail", async () => {
    const r = await api(t.base, "GET", `/api/quizzes/${id}`, undefined, carol.cookie);
    assert.equal(r.json.myBest.correct, 2);
    assert.equal(r.json.myBest.total, 2);
    assert.equal(r.json.leaderboard.length, 3);
    const anon = await api(t.base, "GET", `/api/quizzes/${id}`);
    assert.equal(anon.json.myBest, null);
    assert.equal(anon.json.leaderboard.length, 3);
  });

  it("resets when the author changes the questions", async () => {
    const changed = { title: "Board", questions: [{ ...sampleQuestions[0], answer: 0 }, sampleQuestions[1]] };
    await api(t.base, "PUT", `/api/quizzes/${id}`, changed, alice.cookie);
    const r = await api(t.base, "GET", `/api/quizzes/${id}`, undefined, carol.cookie);
    assert.equal(r.json.version, 2);
    assert.deepEqual(r.json.leaderboard, []);
    assert.equal(r.json.myBest, null);
    await playThrough(t, bob, id, { Q1: 0, Q2: true });
    const after = await api(t.base, "GET", `/api/quizzes/${id}/leaderboard`);
    assert.equal(after.json.length, 1);
    assert.equal(after.json[0].username, "bob");
  });

  it("hides drafts", async () => {
    const d = await api(t.base, "POST", "/api/quizzes", { title: "Draft", questions: sampleQuestions }, alice.cookie);
    const r = await api(t.base, "GET", `/api/quizzes/${d.json.id}/leaderboard`);
    assert.equal(r.status, 404);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test server/test/social.test.ts`
Expected: FAIL. The vote route returns 404 "Not found" (unknown API path) and `leaderboard` is undefined on the detail.

- [ ] **Step 4: Create server/social.ts**

```ts
import type { Db } from "./db.ts";
import type { BestAttempt, LeaderboardEntry } from "../shared/types.ts";

// Best attempt first: most correct, then fastest, then earliest finish.
const BEST_ORDER = "correct DESC, (finished_at - started_at) ASC, finished_at ASC";

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
       ORDER BY a.correct DESC, duration_ms ASC, a.finished_at ASC
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
```

- [ ] **Step 5: Extend server/routes/quizzes.ts**

Add the import:

```ts
import { bestFor, leaderboardFor, scoreOf, voteOf } from "../social.ts";
```

Replace the `GET /quizzes/:id` handler body with:

```ts
  r.get("/quizzes/:id", (req, res) => {
    const row = getQuizRow(db, idParam(req.params.id));
    const me = getUser(res);
    const isAuthor = me?.id === row.author_id;
    if (!row.published && !isAuthor) throw new HttpError(404, "Not found");
    const detail = {
      ...toCard(row),
      version: row.version,
      myVote: me ? voteOf(db, row.id, me.id) : 0,
      leaderboard: leaderboardFor(db, row.id, row.version),
      myBest: me ? bestFor(db, row.id, row.version, me.id) : null,
    };
    if (isAuthor) {
      res.json({ ...detail, questions: JSON.parse(row.questions) as Question[], published: row.published === 1 });
      return;
    }
    res.json(detail);
  });
```

Add these two routes before `return r;`:

```ts
  r.put("/quizzes/:id/vote", requireUser, (req, res) => {
    const me = requireMe(res);
    const row = getQuizRow(db, idParam(req.params.id));
    if (!row.published) throw new HttpError(404, "Not found");
    if (row.author_id === me.id) throw new HttpError(403, "You cannot vote on your own quiz");
    const value = (req.body as { value?: unknown } | null)?.value;
    if (value !== 1 && value !== -1 && value !== 0) throw new HttpError(400, "value must be 1, -1, or 0");
    if (value === 0) {
      db.prepare("DELETE FROM votes WHERE user_id = ? AND quiz_id = ?").run(me.id, row.id);
    } else {
      db.prepare(
        "INSERT INTO votes (user_id, quiz_id, value) VALUES (?, ?, ?) ON CONFLICT(user_id, quiz_id) DO UPDATE SET value = excluded.value"
      ).run(me.id, row.id, value);
    }
    res.json({ score: scoreOf(db, row.id), myVote: value });
  });

  r.get("/quizzes/:id/leaderboard", (req, res) => {
    const row = getQuizRow(db, idParam(req.params.id));
    if (!row.published) throw new HttpError(404, "Not found");
    res.json(leaderboardFor(db, row.id, row.version));
  });
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, including the phase 1 suites (the detail payload gained fields; nothing asserted their absence). Then `npx tsc -p tsconfig.server.json` clean.

- [ ] **Step 7: Commit**

```bash
git add shared/types.ts server/social.ts server/routes/quizzes.ts server/test/social.test.ts
git commit -m "Add quiz votes and a per-version leaderboard

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BxXovJBHEBSQVrspo5Wc4G"
```

---

### Task 2: Tags and attempt history routes

**Files:**
- Create: `server/routes/tags.ts`, `server/test/tags.test.ts`
- Modify: `server/routes/users.ts`, `server/app.ts`

**Interfaces:**
- Produces: `GET /api/tags?q=` returning `TagCount[]` (published quizzes only, prefix match, top 20 by count then name). `GET /api/me/attempts` returning `AttemptSummary[]` (last 50 finished, newest first).

- [ ] **Step 1: Write the failing test**

Create `server/test/tags.test.ts`:

```ts
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { api, asUser, sampleQuestions, startServer, type TestServer } from "./helpers.ts";

describe("tags", () => {
  let t: TestServer;
  let alice: { id: number; cookie: string };
  before(async () => {
    t = await startServer();
    alice = asUser(t.db, "alice");
    const make = async (title: string, tags: string[], publish: boolean) => {
      const r = await api(t.base, "POST", "/api/quizzes", { title, tags, questions: sampleQuestions }, alice.cookie);
      if (publish) await api(t.base, "POST", `/api/quizzes/${r.json.id}/publish`, undefined, alice.cookie);
    };
    await make("A", ["unity", "csharp"], true);
    await make("B", ["unity", "shaders"], true);
    await make("C", ["unity", "secret"], false);
  });
  after(() => t.close());

  it("counts tags on published quizzes, most used first", async () => {
    const r = await api(t.base, "GET", "/api/tags");
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, [
      { tag: "unity", count: 2 },
      { tag: "csharp", count: 1 },
      { tag: "shaders", count: 1 },
    ]);
  });

  it("matches by prefix and ignores odd characters", async () => {
    const r = await api(t.base, "GET", "/api/tags?q=Sh%25");
    assert.deepEqual(r.json, [{ tag: "shaders", count: 1 }]);
    const none = await api(t.base, "GET", "/api/tags?q=zzz");
    assert.deepEqual(none.json, []);
  });
});

describe("attempt history", () => {
  let t: TestServer;
  let alice: { id: number; cookie: string };
  let bob: { id: number; cookie: string };
  let id: number;
  before(async () => {
    t = await startServer();
    alice = asUser(t.db, "alice");
    bob = asUser(t.db, "bob");
    const r = await api(t.base, "POST", "/api/quizzes", { title: "History", questions: sampleQuestions }, alice.cookie);
    id = r.json.id;
    await api(t.base, "POST", `/api/quizzes/${id}/publish`, undefined, alice.cookie);
  });
  after(() => t.close());

  it("requires sign-in", async () => {
    const r = await api(t.base, "GET", "/api/me/attempts");
    assert.equal(r.status, 401);
  });

  it("lists finished attempts newest first with the quiz title", async () => {
    const first = await api(t.base, "POST", `/api/quizzes/${id}/attempts`, undefined, bob.cookie);
    await api(t.base, "POST", `/api/attempts/${first.json.attemptId}`, { answers: { Q1: 1 } }, bob.cookie);
    const unfinished = await api(t.base, "POST", `/api/quizzes/${id}/attempts`, undefined, bob.cookie);
    assert.equal(unfinished.status, 201);
    const second = await api(t.base, "POST", `/api/quizzes/${id}/attempts`, undefined, bob.cookie);
    await api(t.base, "POST", `/api/attempts/${second.json.attemptId}`, { answers: { Q1: 1, Q2: true } }, bob.cookie);
    const r = await api(t.base, "GET", "/api/me/attempts", undefined, bob.cookie);
    assert.equal(r.status, 200);
    assert.equal(r.json.length, 2);
    assert.equal(r.json[0].correct, 2);
    assert.equal(r.json[1].correct, 1);
    assert.deepEqual(r.json[0].quiz, { id, title: "History" });
    assert.equal(r.json[0].total, 2);
    assert.equal(typeof r.json[0].durationMs, "number");
    assert.equal(typeof r.json[0].finishedAt, "number");
    const empty = await api(t.base, "GET", "/api/me/attempts", undefined, alice.cookie);
    assert.deepEqual(empty.json, []);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test server/test/tags.test.ts`
Expected: FAIL, `/api/tags` and `/api/me/attempts` return 404.

- [ ] **Step 3: Create server/routes/tags.ts**

```ts
import express from "express";
import type { Db } from "../db.ts";
import type { TagCount } from "../../shared/types.ts";

export function tagRoutes(db: Db): express.Router {
  const r = express.Router();

  r.get("/tags", (req, res) => {
    // Tags only ever contain [a-z0-9-], so stripping anything else also removes LIKE wildcards.
    const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase().replace(/[^a-z0-9-]/g, "") : "";
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
```

- [ ] **Step 4: Add the history route to server/routes/users.ts**

Add `import type { AttemptSummary } from "../../shared/types.ts";` and this type near the top:

```ts
type AttemptRow = {
  id: number;
  quiz_id: number;
  title: string;
  correct: number;
  total: number;
  duration_ms: number;
  finished_at: number;
};
```

Add before `return r;`:

```ts
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
```

- [ ] **Step 5: Mount the tag router in server/app.ts**

Add `import { tagRoutes } from "./routes/tags.ts";` and `app.use("/api", tagRoutes(db));` after the user routes.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS. Then `npx tsc -p tsconfig.server.json` clean.

- [ ] **Step 7: Commit**

```bash
git add server/routes/tags.ts server/routes/users.ts server/app.ts server/test/tags.test.ts
git commit -m "Add tag counts and attempt history routes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BxXovJBHEBSQVrspo5Wc4G"
```

---

### Task 3: Votes and leaderboard on the quiz page

**Files:**
- Create: `src/format.ts`
- Modify: `src/api.ts`, `src/pages/Quiz.tsx`

**Interfaces:**
- Consumes: `PUT /api/quizzes/:id/vote`, the new detail fields.
- Produces: `vote(id, value): Promise<{ score: number; myVote: number }>`, `getTags(q?)`, `getMyAttempts()`, `formatDuration(ms): string`. `QuizDetail` gains `version: number; myVote: number; leaderboard: LeaderboardEntry[]; myBest: BestAttempt | null`.

- [ ] **Step 1: Extend src/api.ts**

Change the first import line to:

```ts
import type { Answers, AttemptSummary, BestAttempt, LeaderboardEntry, Me, PlayQuestion, Question, QuizCard, TagCount } from "../shared/types.ts";
```

Replace the `QuizDetail` type with:

```ts
export type QuizDetail = QuizCard & {
  version: number;
  myVote: number;
  leaderboard: LeaderboardEntry[];
  myBest: BestAttempt | null;
  questions?: Question[];
  published?: boolean;
};
```

Append:

```ts
export const vote = (id: number | string, value: 1 | -1 | 0) =>
  request<{ score: number; myVote: number }>("PUT", `/api/quizzes/${id}/vote`, { value });
export const getTags = (q = "") => request<TagCount[]>("GET", `/api/tags${q ? `?q=${encodeURIComponent(q)}` : ""}`);
export const getMyAttempts = () => request<AttemptSummary[]>("GET", "/api/me/attempts");
```

- [ ] **Step 2: Create src/format.ts**

```ts
/** 65_000 -> "1:05", 9_400 -> "0:09". */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
```

- [ ] **Step 3: Update src/pages/Quiz.tsx**

Change the imports at the top to:

```tsx
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { deleteQuiz, getQuiz, publishQuiz, unpublishQuiz, vote, type QuizDetail } from "../api.ts";
import { useMe } from "../me.tsx";
import { ErrorBox } from "../components/ErrorBox.tsx";
import { formatDuration } from "../format.ts";
```

Add a state line after `const [busy, setBusy] = useState(false);`:

```tsx
  const [voteHint, setVoteHint] = useState(false);
```

Add this function after `act`:

```tsx
  function castVote(value: 1 | -1) {
    if (!me) {
      setVoteHint(true);
      return;
    }
    if (!quiz) return;
    const next = quiz.myVote === value ? 0 : value;
    void act(() => vote(quiz.id, next));
  }
```

Replace the stats row (the `<div className="mt-4 flex flex-wrap gap-3 text-sm text-neutral-400">` block) with:

```tsx
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-neutral-400">
        <span className="inline-flex items-center gap-1">
          <button
            disabled={busy || isAuthor}
            onClick={() => castVote(1)}
            title={isAuthor ? "Authors cannot vote on their own quiz" : "Upvote"}
            aria-label="Upvote"
            className={`rounded-md px-2 py-0.5 ${quiz.myVote === 1 ? "bg-emerald-600 text-white" : "bg-neutral-800 hover:bg-neutral-700"} disabled:opacity-50`}
          >
            ▲
          </button>
          <span className="tabular-nums min-w-6 text-center text-neutral-200">{quiz.score}</span>
          <button
            disabled={busy || isAuthor}
            onClick={() => castVote(-1)}
            title={isAuthor ? "Authors cannot vote on their own quiz" : "Downvote"}
            aria-label="Downvote"
            className={`rounded-md px-2 py-0.5 ${quiz.myVote === -1 ? "bg-red-600 text-white" : "bg-neutral-800 hover:bg-neutral-700"} disabled:opacity-50`}
          >
            ▼
          </button>
        </span>
        {voteHint && !me && (
          <span>
            <a href="/api/auth/github" className="underline">
              Sign in
            </a>{" "}
            to vote.
          </span>
        )}
        <span>{quiz.questionCount} questions</span>
        <span>{quiz.plays} plays</span>
        {quiz.tags.map((t) => (
          <Link key={t} to={`/?tag=${encodeURIComponent(t)}`} className="rounded-md bg-neutral-800 px-1.5 py-0.5 hover:bg-neutral-700">
            {t}
          </Link>
        ))}
      </div>
```

Change the outer `return (` so the card is followed by a leaderboard section. The component now returns a fragment:

```tsx
  return (
    <>
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
        ... existing card content, unchanged apart from the stats row above ...
      </div>

      {isPublished && (
        <section className="mt-6 bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
          <h2 className="text-xl font-semibold mb-3">Leaderboard</h2>
          {quiz.leaderboard.length === 0 ? (
            <p className="text-sm text-neutral-400">
              {quiz.version > 1 ? "Leaderboard reset when the quiz was updated. No attempts on this version yet." : "No attempts yet."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-neutral-400 text-left">
                <tr>
                  <th className="py-1 pr-3 font-normal">#</th>
                  <th className="py-1 pr-3 font-normal">Player</th>
                  <th className="py-1 pr-3 font-normal">Score</th>
                  <th className="py-1 pr-3 font-normal">Time</th>
                </tr>
              </thead>
              <tbody>
                {quiz.leaderboard.map((e, i) => (
                  <tr key={e.username} className="border-t border-neutral-800">
                    <td className="py-1.5 pr-3 tabular-nums">{i + 1}</td>
                    <td className="py-1.5 pr-3">
                      <Link to={`/u/${e.username}`} className="inline-flex items-center gap-2 hover:text-white">
                        <img src={e.avatarUrl} alt="" className="h-5 w-5 rounded-full bg-neutral-800" />
                        {e.username}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums">
                      {e.correct}/{e.total}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums">{formatDuration(e.durationMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {quiz.myBest && (
            <p className="mt-3 text-sm text-neutral-400">
              Your best: {quiz.myBest.correct}/{quiz.myBest.total} in {formatDuration(quiz.myBest.durationMs)}
            </p>
          )}
        </section>
      )}
    </>
  );
```

Keep everything inside the card exactly as it was (draft badge, title, author link, description, the new stats row, the actions row, the inline `ErrorBox`).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/api.ts src/format.ts src/pages/Quiz.tsx
git commit -m "Show votes and the leaderboard on the quiz page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BxXovJBHEBSQVrspo5Wc4G"
```

---

### Task 4: Tag chips, tag input, attempt history, README line

**Files:**
- Create: `src/components/TagInput.tsx`
- Modify: `src/pages/Catalog.tsx`, `src/pages/Publish.tsx`, `src/pages/Me.tsx`, `README.md`

**Interfaces:**
- Consumes: `getTags`, `getMyAttempts`, `normalizeTags`, `MAX_TAGS` from `shared/validate.ts`, `formatDuration`.
- Produces: `TagInput` with props `{ value: string[]; onChange: (tags: string[]) => void }`.

- [ ] **Step 1: Create src/components/TagInput.tsx**

```tsx
import { useEffect, useState } from "react";
import type { TagCount } from "../../shared/types.ts";
import { MAX_TAGS, normalizeTags } from "../../shared/validate.ts";
import { getTags } from "../api.ts";

const chip = "inline-flex items-center gap-1 rounded-md bg-neutral-800 px-2 py-0.5 text-sm";

export function TagInput({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState<TagCount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const full = value.length >= MAX_TAGS;

  useEffect(() => {
    const q = text.trim().toLowerCase();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    let alive = true;
    getTags(q)
      .then((tags) => alive && setSuggestions(tags.filter((t) => !value.includes(t.tag))))
      .catch(() => alive && setSuggestions([]));
    return () => {
      alive = false;
    };
  }, [text, value]);

  function add(raw: string) {
    try {
      onChange(normalizeTags([...value, raw]));
      setText("");
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {value.map((t) => (
            <span key={t} className={chip}>
              {t}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Remove ${t}`} className="text-neutral-400 hover:text-white">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        value={text}
        disabled={full}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === ",") && text.trim()) {
            e.preventDefault();
            add(text);
          }
        }}
        placeholder={full ? `Up to ${MAX_TAGS} tags` : "Add a tag and press Enter"}
        aria-label="Add a tag"
        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-50"
      />
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button key={s.tag} type="button" onClick={() => add(s.tag)} className={`${chip} hover:bg-neutral-700`}>
              {s.tag} <span className="text-neutral-500">{s.count}</span>
            </button>
          ))}
        </div>
      )}
      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Add the TagInput to src/pages/Publish.tsx**

Add `import { TagInput } from "../components/TagInput.tsx";`. After the Description textarea, insert:

```tsx
      <label className="block text-sm text-neutral-300 mt-4 mb-1">Tags</label>
      <TagInput value={tags} onChange={setTags} />
```

Nothing else changes; `buildInput` already prefers the field over the file's metadata and `onTextChange` already prefills when empty.

- [ ] **Step 3: Add tag chips to src/pages/Catalog.tsx**

Change the api import to `import { getTags, listQuizzes, type QuizPage } from "../api.ts";` and add `import type { TagCount } from "../../shared/types.ts";`.

Add state after `error`:

```tsx
  const [tags, setTags] = useState<TagCount[]>([]);
```

Add an effect after the listing effect:

```tsx
  useEffect(() => {
    let alive = true;
    getTags()
      .then((t) => alive && setTags(t))
      .catch(() => alive && setTags([]));
    return () => {
      alive = false;
    };
  }, []);
```

After the sort/filters `<div className="flex flex-wrap items-center gap-2 mb-6">...</div>` block, insert:

```tsx
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {tags.map((t) => (
            <button
              key={t.tag}
              onClick={() => setParam("tag", tag === t.tag ? "" : t.tag)}
              className={`rounded-md px-2 py-0.5 text-xs ${tag === t.tag ? "bg-emerald-600 text-white" : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300"}`}
            >
              {t.tag} <span className="opacity-60">{t.count}</span>
            </button>
          ))}
        </div>
      )}
```

- [ ] **Step 4: Add the history section to src/pages/Me.tsx**

Change the imports to:

```tsx
import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { AttemptSummary, QuizCard } from "../../shared/types.ts";
import { getMyAttempts, getMyQuizzes, type MyQuizzes } from "../api.ts";
import { useMe } from "../me.tsx";
import { QuizCardView } from "../components/QuizCardView.tsx";
import { ErrorBox } from "../components/ErrorBox.tsx";
import { formatDuration } from "../format.ts";
```

Add state `const [attempts, setAttempts] = useState<AttemptSummary[] | null>(null);` and change the effect body's fetch to:

```tsx
    Promise.all([getMyQuizzes(), getMyAttempts()])
      .then(([quizzes, history]) => {
        setData(quizzes);
        setAttempts(history);
      })
      .catch((e: Error) => setError(e.message));
```

Add after the Published section:

```tsx
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">History</h2>
        {!attempts || attempts.length === 0 ? (
          <p className="text-neutral-400 text-sm">No finished attempts yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-neutral-400 text-left">
              <tr>
                <th className="py-1 pr-3 font-normal">Quiz</th>
                <th className="py-1 pr-3 font-normal">Score</th>
                <th className="py-1 pr-3 font-normal">Time</th>
                <th className="py-1 pr-3 font-normal">When</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((a) => (
                <tr key={a.id} className="border-t border-neutral-800">
                  <td className="py-1.5 pr-3">
                    <Link to={`/quiz/${a.quiz.id}`} className="hover:text-white">
                      {a.quiz.title}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">
                    {a.correct}/{a.total}
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">{formatDuration(a.durationMs)}</td>
                  <td className="py-1.5 pr-3">{new Date(a.finishedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
```

- [ ] **Step 5: README**

In `README.md`, change the first paragraph's second sentence to: `Grading happens on the server, so the answer key never reaches the browser before you submit. Vote quizzes up or down, filter by tag, and compete on each quiz's leaderboard.` Keep the rest.

- [ ] **Step 6: Build and test**

Run: `npm run build` (clean) and `npm test` (all pass).

- [ ] **Step 7: Commit**

```bash
git add src/components/TagInput.tsx src/pages/Catalog.tsx src/pages/Publish.tsx src/pages/Me.tsx README.md
git commit -m "Add tag chips, a tag input with suggestions, and attempt history

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BxXovJBHEBSQVrspo5Wc4G"
```

---

### Task 5: Phase 2 checklist

Run by the controller with the headless checklist script, extended with these steps. Each must pass before the phase is called done:

1. Vote up as a non-author: score goes to 1 and the up button is highlighted. Click up again: score 0, nothing highlighted. Vote down: score -1. The author sees both buttons disabled.
2. Signed out, clicking a vote button shows "Sign in to vote."
3. Two users finish the same quiz with different scores; the leaderboard lists the better score first. A third user with the same score but a longer time sorts below. A user who plays twice appears once, with their better attempt. "Your best" shows for a signed-in player.
4. After the author changes an answer, the quiz page says the leaderboard was reset.
5. Catalog shows tag chips with counts; clicking one filters the list; clicking it again clears.
6. Publish form: typing two letters shows suggestions; Enter adds a tag; a sixth tag is refused with the "at most 5" message; the × removes a tag; the published quiz shows the tags.
7. My quizzes shows the History table with the finished attempts, newest first.
8. `npm test` passes and `npm run build` is clean.
