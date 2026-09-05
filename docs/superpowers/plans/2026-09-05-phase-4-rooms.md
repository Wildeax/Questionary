# Phase 4: Rooms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in host open a room for a published quiz, share a 6-character code, and play live against friends who join by nickname, in race mode (same start, own pace, live board) or synchronized mode (one question at a time with a timer and speed-scaled points).

**Architecture:** `server/rooms.ts` is a pure in-memory state machine (`RoomStore`) that takes an injectable clock and scheduler, so tests drive countdowns and question timers without waiting. `server/routes/rooms.ts` maps HTTP onto it and pushes full snapshots over Server-Sent Events; actions arrive as POSTs. Players are identified by a random id in an `rp` cookie. The frontend adds a room-creation page and a single room page that renders by snapshot state, reusing `QuestionPage` and `ResultsView`.

**Tech Stack:** Same as earlier phases. No new dependencies. SSE uses Express's `res.write`; the browser side uses the built-in `EventSource`.

**Spec:** `docs/superpowers/specs/2026-09-04-community-quizzes-design.md` (sections 3 phase 4, 10 rooms, 14, 15, 19).

## Global Constraints

- Node runs `.ts` directly. Inside `server/` and `shared/`, every relative import uses an explicit `.ts` extension, and every type-only import uses `import type` or `import { type X }`. No enums, no namespaces, no constructor parameter properties.
- No new dependencies of any kind.
- Rooms live only in memory in one process. A restart drops them. This is the spec's accepted shortcut and carries a `// ponytail:` comment.
- Codes are 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. Rooms idle for 2 hours are swept every 5 minutes.
- Host must be signed in and is seated under their GitHub username. Joiners give a nickname of 1 to 20 characters, unique in the room (case-insensitive). Joining is allowed only in `lobby`. At most 50 players.
- Snapshots never carry `answer` or `explanation` except inside `reveal`.
- Race: 3-second countdown, then everyone answers at their own pace; each answer is final; a player is finished when every question is answered; the response to the final answer carries the graded results with full questions; ranking is `correct DESC, durationMs ASC`; host `end` finishes everyone (unanswered count as wrong). `durationMs` counts from the end of the countdown.
- Synchronized: `questionSeconds` between 5 and 120, default 20; one answer per player per question; a correct answer scores `max(500, round(1000 - 500 * elapsedMs / limitMs))`, wrong or missing scores 0; the question ends at the deadline or when everyone answered; ranking is `points DESC, lastCorrectAt ASC`.
- Errors are `HttpError` with `{ "error": "message" }`; join errors are 400 (nickname) or 409 (started, full); host-only actions are 403 for others; non-members get 403 on the event stream.
- Server tests use `node:test` under `server/test/`.
- Frontend patterns as before: `ErrorBox`, explicit extensions, react-router 7 from `"react-router"`.
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
shared/types.ts              add RoomMode, RoomState, RoomPlayerView, RoomQuestionView, RoomSnapshot
server/rooms.ts              new: RoomStore, Clock, realClock, newPlayerId, MAX_PLAYERS, COUNTDOWN_MS
server/routes/rooms.ts       new: HTTP + SSE
server/app.ts                createApp(db, config, store) mounts roomRoutes
server/index.ts              creates the store, sweeps every 5 minutes
server/test/rooms.test.ts    state machine with a fake clock
server/test/rooms-http.test.ts  HTTP and SSE
src/api.ts                   room calls
src/pages/RoomNew.tsx        new
src/pages/Room.tsx           new
src/pages/Quiz.tsx           "Host a room" link
src/router.tsx               two routes
README.md                    one sentence
```

---

### Task 1: Room state machine

**Files:**
- Create: `server/rooms.ts`, `server/test/rooms.test.ts`
- Modify: `shared/types.ts`

**Interfaces:**
- Produces: `RoomStore` with `create`, `get`, `join`, `start`, `answer`, `next`, `end`, `subscribe`, `snapshot`, `sweep`; `Clock` type; `realClock`; `newPlayerId()`; the snapshot types.

- [ ] **Step 1: Add the shared types**

Append to `shared/types.ts`:

```ts
export type RoomMode = "race" | "sync";
export type RoomState = "lobby" | "countdown" | "running" | "question" | "reveal" | "finished";

export type RoomPlayerView = {
  id: string;
  nickname: string;
  answered: number;
  finished: boolean;
  correct?: number;
  durationMs?: number;
  points?: number;
  lastPoints?: number;
};

export type RoomQuestionView = {
  index: number;
  id: string;
  prompt: string;
  type: "mc" | "tf";
  options?: string[];
  endsAt: number;
};

export type RoomSnapshot = {
  code: string;
  mode: RoomMode;
  state: RoomState;
  questionSeconds: number;
  quiz: { id: number; title: string; questionCount: number };
  host: string;
  you: { id: string; isHost: boolean; answered: string[] } | null;
  players: RoomPlayerView[];
  countdownEndsAt?: number;
  question?: RoomQuestionView;
  reveal?: { questionId: string; answer: number | boolean; explanation?: string; scoreboard: RoomPlayerView[] };
  ranking?: RoomPlayerView[];
};
```

- [ ] **Step 2: Write the failing test**

Create `server/test/rooms.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { COUNTDOWN_MS, RoomStore, type Clock } from "../rooms.ts";
import type { Question } from "../../shared/types.ts";

function fakeClock(): Clock & { advance: (ms: number) => void; pending: () => number } {
  let t = 1_000_000;
  const timers: { at: number; fn: () => void }[] = [];
  return {
    now: () => t,
    schedule(fn, ms) {
      const timer = { at: t + ms, fn };
      timers.push(timer);
      return () => {
        const i = timers.indexOf(timer);
        if (i >= 0) timers.splice(i, 1);
      };
    },
    advance(ms) {
      const target = t + ms;
      for (;;) {
        const due = timers.filter((x) => x.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        t = due.at;
        timers.splice(timers.indexOf(due), 1);
        due.fn();
      }
      t = target;
    },
    pending: () => timers.length,
  };
}

const questions: Question[] = [
  { id: "Q1", type: "mc", prompt: "Pick B", options: ["A", "B"], answer: 1, explanation: "B" },
  { id: "Q2", type: "tf", prompt: "Yes", answer: true },
];
const quiz = { id: 7, title: "Smoke", questions };
const host = { playerId: "h".repeat(32), nickname: "alice", userId: 1 };

function setup(mode: "race" | "sync", seconds = 20) {
  const clock = fakeClock();
  const store = new RoomStore(clock);
  const room = store.create(host, quiz, mode, seconds);
  store.join(room, "b".repeat(32), "bob");
  store.join(room, "c".repeat(32), "carol");
  return { clock, store, room, bob: "b".repeat(32), carol: "c".repeat(32) };
}

describe("room creation and joining", () => {
  it("seats the host, generates a 6-char code, and enforces join rules", () => {
    const { store, room } = setup("race");
    assert.match(room.code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    assert.equal(store.get(room.code.toLowerCase()), room);
    assert.equal(room.players.size, 3);
    assert.throws(() => store.join(room, "d".repeat(32), "BOB"), /taken/);
    assert.throws(() => store.join(room, "d".repeat(32), ""), /1 to 20/);
    assert.throws(() => store.join(room, "d".repeat(32), "x".repeat(21)), /1 to 20/);
    store.join(room, "b".repeat(32), "whatever"); // already seated: no-op
    assert.equal(room.players.get("b".repeat(32))!.nickname, "bob");
    assert.throws(() => store.create(host, quiz, "sync", 3), /5 and 120/);
  });

  it("refuses joins after start and beyond 50 players", () => {
    const { store, room } = setup("race");
    for (let i = room.players.size; i < 50; i++) store.join(room, String(i).padStart(32, "0"), `p${i}`);
    assert.throws(() => store.join(room, "z".repeat(32), "late"), /full/);
    store.start(room, host.playerId);
    assert.throws(() => store.join(room, "y".repeat(32), "later"), /already started/);
  });

  it("only the host can start", () => {
    const { store, room, bob } = setup("race");
    assert.throws(() => store.start(room, bob), /host/);
  });
});

describe("race mode", () => {
  it("counts down, runs, grades per player, finishes, and ranks", () => {
    const { clock, store, room, bob, carol } = setup("race");
    const seen: string[] = [];
    store.subscribe(room, () => seen.push(room.state));
    store.start(room, host.playerId);
    assert.equal(room.state, "countdown");
    assert.equal(store.snapshot(room, bob).countdownEndsAt, clock.now() + COUNTDOWN_MS);
    assert.throws(() => store.answer(room, bob, "Q1", 1), /not running/);
    clock.advance(COUNTDOWN_MS);
    assert.equal(room.state, "running");

    clock.advance(1000);
    assert.deepEqual(store.answer(room, bob, "Q1", 1), { finished: false });
    assert.throws(() => store.answer(room, bob, "Q1", 0), /Already answered/);
    assert.throws(() => store.answer(room, bob, "Q2", 1), /Wrong answer type/);
    assert.throws(() => store.answer(room, bob, "nope", 1), /Unknown question/);
    const mid = store.snapshot(room, carol);
    assert.deepEqual(mid.players.find((p) => p.nickname === "bob"), { id: bob, nickname: "bob", answered: 1, finished: false });
    assert.equal(mid.question, undefined);

    const done = store.answer(room, bob, "Q2", true);
    assert.equal(done.finished, true);
    if (done.finished) {
      assert.equal(done.correct, 2);
      assert.equal(done.durationMs, 1000);
      assert.equal(done.questions[0].answer, 1);
    }
    clock.advance(5000);
    store.answer(room, carol, "Q1", 0);
    store.answer(room, carol, "Q2", true);
    assert.equal(room.state, "running"); // host has not answered
    store.end(room, host.playerId);
    assert.equal(room.state, "finished");
    const final = store.snapshot(room, null);
    assert.deepEqual(final.ranking!.map((p) => [p.nickname, p.correct, p.durationMs]), [
      ["bob", 2, 1000],
      ["carol", 1, 6000],
      ["alice", 0, 6000],
    ]);
    assert.ok(seen.includes("countdown") && seen.includes("running") && seen.includes("finished"));
  });

  it("finishes on its own when every player is done", () => {
    const { clock, store, room, bob, carol } = setup("race");
    store.start(room, host.playerId);
    clock.advance(COUNTDOWN_MS);
    for (const p of [host.playerId, bob, carol]) {
      store.answer(room, p, "Q1", 1);
      store.answer(room, p, "Q2", true);
    }
    assert.equal(room.state, "finished");
    assert.throws(() => store.end(room, host.playerId), /Nothing to end/);
  });
});

describe("synchronized mode", () => {
  it("shows questions, scores by speed, reveals early when all answered, and ranks with a tie-break", () => {
    const { clock, store, room, bob, carol } = setup("sync", 20);
    store.start(room, host.playerId);
    assert.equal(room.state, "question");
    const q = store.snapshot(room, bob).question!;
    assert.equal(q.id, "Q1");
    assert.deepEqual(q.options, ["A", "B"]);
    assert.equal(q.endsAt, clock.now() + 20_000);
    assert.ok(!("answer" in q));

    clock.advance(4000);
    store.answer(room, bob, "Q1", 1); // correct at 4 s of 20: 1000 - 100 = 900
    assert.throws(() => store.answer(room, bob, "Q1", 1), /Already answered/);
    assert.throws(() => store.answer(room, bob, "Q2", true), /not open/);
    clock.advance(2000);
    store.answer(room, carol, "Q1", 0); // wrong: 0
    assert.equal(room.state, "question");
    store.answer(room, host.playerId, "Q1", 1); // everyone answered: reveal now
    assert.equal(room.state, "reveal");
    assert.equal(clock.pending(), 0);
    const reveal = store.snapshot(room, carol).reveal!;
    assert.equal(reveal.answer, 1);
    assert.equal(reveal.explanation, "B");
    assert.deepEqual(reveal.scoreboard.map((p) => [p.nickname, p.points, p.lastPoints]), [
      ["bob", 900, 900],
      ["alice", 850, 850],
      ["carol", 0, 0],
    ]);

    assert.throws(() => store.next(room, bob), /host/);
    store.next(room, host.playerId);
    assert.equal(room.state, "question");
    assert.equal(store.snapshot(room, bob).question!.id, "Q2");
    clock.advance(25_000); // deadline passes with no answers
    assert.equal(room.state, "reveal");
    assert.deepEqual(store.snapshot(room, bob).reveal!.scoreboard.map((p) => p.lastPoints), [0, 0, 0]);
    store.next(room, host.playerId);
    assert.equal(room.state, "finished");
    assert.deepEqual(store.snapshot(room, null).ranking!.map((p) => [p.nickname, p.points]), [
      ["bob", 900],
      ["alice", 850],
      ["carol", 0],
    ]);
  });

  it("floors points at 500 near the deadline and breaks ties by who scored first", () => {
    const { clock, store, room, bob, carol } = setup("sync", 10);
    store.start(room, host.playerId);
    clock.advance(9_900);
    store.answer(room, bob, "Q1", 1); // 1000 - 495 = 505
    clock.advance(50);
    store.answer(room, carol, "Q1", 1); // 1000 - 497.5 -> 503, floored? no: 502.5 rounds to 503
    store.answer(room, host.playerId, "Q1", 1);
    const board = store.snapshot(room, null).reveal!.scoreboard;
    assert.equal(board.find((p) => p.nickname === "bob")!.points, 505);
    assert.equal(board.find((p) => p.nickname === "carol")!.points, 503);
    store.next(room, host.playerId);
    clock.advance(11_000);
    store.next(room, host.playerId);
    assert.equal(room.state, "finished");
    const tie = setup("sync", 10);
    tie.store.start(tie.room, host.playerId);
    tie.clock.advance(1000);
    tie.store.answer(tie.room, tie.carol, "Q1", 1);
    tie.clock.advance(1);
    tie.store.answer(tie.room, tie.bob, "Q1", 1);
    tie.store.answer(tie.room, host.playerId, "Q1", 0);
    assert.deepEqual(
      tie.store.snapshot(tie.room, null).reveal!.scoreboard.map((p) => p.nickname),
      ["carol", "bob", "alice"]
    );
  });
});

describe("sweep", () => {
  it("drops rooms idle longer than the limit and cancels their timers", () => {
    const { clock, store, room } = setup("sync");
    store.start(room, host.playerId);
    assert.equal(clock.pending(), 1);
    clock.advance(1000);
    assert.equal(store.sweep(500), 1);
    assert.equal(store.get(room.code), undefined);
    assert.equal(clock.pending(), 0);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test server/test/rooms.test.ts`
Expected: FAIL, cannot find module `server/rooms.ts`.

- [ ] **Step 4: Create server/rooms.ts**

```ts
import { randomBytes } from "node:crypto";
import { HttpError } from "./http.ts";
import { grade } from "../shared/grade.ts";
import type { Answers, Question, RoomMode, RoomPlayerView, RoomSnapshot, RoomState } from "../shared/types.ts";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const MAX_PLAYERS = 50;
export const COUNTDOWN_MS = 3000;

export type Player = {
  id: string;
  nickname: string;
  userId?: number;
  answers: Record<string, { value: number | boolean; at: number }>;
  correct: number;
  points: number;
  lastPoints: number;
  lastCorrectAt?: number;
  finishedAt?: number;
};

export type Room = {
  code: string;
  hostPlayerId: string;
  quiz: { id: number; title: string; questions: Question[] };
  mode: RoomMode;
  state: RoomState;
  players: Map<string, Player>;
  questionSeconds: number;
  currentIndex: number;
  questionStartedAt: number;
  countdownEndsAt: number;
  runningSince: number;
  createdAt: number;
  lastActivity: number;
  listeners: Set<() => void>;
  cancelTimer?: () => void;
};

/** Time source and one-shot scheduler, injectable so tests can drive timers. */
export type Clock = {
  now: () => number;
  schedule: (fn: () => void, ms: number) => () => void;
};

export const realClock: Clock = {
  now: () => Date.now(),
  schedule: (fn, ms) => {
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
  },
};

export type RaceAnswerResult =
  | { finished: false }
  | { finished: true; correct: number; total: number; durationMs: number; questions: Question[] };

/** Sync mode answers with `{ ok: true }`; the optional `finished` keeps the union narrowable. */
export type AnswerResult = { ok: true; finished?: undefined } | RaceAnswerResult;

export function newPlayerId(): string {
  return randomBytes(16).toString("hex");
}

function newPlayer(id: string, nickname: string, userId?: number): Player {
  return { id, nickname, userId, answers: {}, correct: 0, points: 0, lastPoints: 0 };
}

// ponytail: rooms live in this Map in one process. Ceiling: a restart drops live rooms
// and a second process cannot see them. Upgrade: a rooms table plus polling, or Redis pub/sub.
export class RoomStore {
  rooms = new Map<string, Room>();
  clock: Clock;

  constructor(clock: Clock = realClock) {
    this.clock = clock;
  }

  create(host: { playerId: string; nickname: string; userId: number }, quiz: Room["quiz"], mode: RoomMode, questionSeconds = 20): Room {
    if (!Number.isInteger(questionSeconds) || questionSeconds < 5 || questionSeconds > 120) {
      throw new HttpError(400, "questionSeconds must be between 5 and 120");
    }
    const now = this.clock.now();
    const room: Room = {
      code: this.newCode(),
      hostPlayerId: host.playerId,
      quiz,
      mode,
      state: "lobby",
      players: new Map(),
      questionSeconds,
      currentIndex: 0,
      questionStartedAt: 0,
      countdownEndsAt: 0,
      runningSince: 0,
      createdAt: now,
      lastActivity: now,
      listeners: new Set(),
    };
    room.players.set(host.playerId, newPlayer(host.playerId, host.nickname, host.userId));
    this.rooms.set(room.code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  join(room: Room, playerId: string, nickname: string, userId?: number): void {
    if (room.players.has(playerId)) return;
    if (room.state !== "lobby") throw new HttpError(409, "This room has already started");
    if (room.players.size >= MAX_PLAYERS) throw new HttpError(409, "This room is full");
    const name = nickname.trim();
    if (name.length < 1 || name.length > 20) throw new HttpError(400, "Nickname must be 1 to 20 characters");
    for (const p of room.players.values()) {
      if (p.nickname.toLowerCase() === name.toLowerCase()) throw new HttpError(400, "That nickname is taken");
    }
    room.players.set(playerId, newPlayer(playerId, name, userId));
    this.touch(room);
  }

  start(room: Room, playerId: string): void {
    this.requireHost(room, playerId);
    if (room.state !== "lobby") throw new HttpError(409, "Already started");
    if (room.mode === "race") {
      room.state = "countdown";
      room.countdownEndsAt = this.clock.now() + COUNTDOWN_MS;
      room.cancelTimer = this.clock.schedule(() => {
        room.cancelTimer = undefined;
        room.state = "running";
        room.runningSince = this.clock.now();
        this.touch(room);
      }, COUNTDOWN_MS);
      this.touch(room);
      return;
    }
    this.showQuestion(room, 0);
  }

  answer(room: Room, playerId: string, questionId: string, value: number | boolean): AnswerResult {
    const player = this.requirePlayer(room, playerId);
    const question = room.quiz.questions.find((q) => q.id === questionId);
    if (!question) throw new HttpError(400, "Unknown question");
    if (question.type === "mc" ? typeof value !== "number" : typeof value !== "boolean") {
      throw new HttpError(400, "Wrong answer type");
    }
    if (player.answers[questionId]) throw new HttpError(409, "Already answered");
    const now = this.clock.now();

    if (room.mode === "race") {
      if (room.state !== "running") throw new HttpError(409, "The race is not running");
      player.answers[questionId] = { value, at: now };
      player.correct = this.correctCount(room, player);
      let result: RaceAnswerResult = { finished: false };
      if (Object.keys(player.answers).length === room.quiz.questions.length) {
        player.finishedAt = now;
        result = {
          finished: true,
          correct: player.correct,
          total: room.quiz.questions.length,
          durationMs: now - room.runningSince,
          questions: room.quiz.questions,
        };
        if ([...room.players.values()].every((p) => p.finishedAt !== undefined)) room.state = "finished";
      }
      this.touch(room);
      return result;
    }

    if (room.state !== "question") throw new HttpError(409, "No question is open");
    const current = room.quiz.questions[room.currentIndex];
    if (current.id !== questionId) throw new HttpError(409, "That question is not open");
    player.answers[questionId] = { value, at: now };
    const correct = grade([question], { [questionId]: value }).correct === 1;
    const limitMs = room.questionSeconds * 1000;
    const points = correct ? Math.max(500, Math.round(1000 - (500 * (now - room.questionStartedAt)) / limitMs)) : 0;
    player.points += points;
    player.lastPoints = points;
    if (correct) {
      player.correct += 1;
      player.lastCorrectAt = now;
    }
    if ([...room.players.values()].every((p) => p.answers[questionId])) this.reveal(room);
    else this.touch(room);
    return { ok: true };
  }

  next(room: Room, playerId: string): void {
    this.requireHost(room, playerId);
    if (room.mode !== "sync" || room.state !== "reveal") throw new HttpError(409, "Nothing to advance");
    if (room.currentIndex + 1 < room.quiz.questions.length) {
      this.showQuestion(room, room.currentIndex + 1);
      return;
    }
    room.state = "finished";
    this.touch(room);
  }

  end(room: Room, playerId: string): void {
    this.requireHost(room, playerId);
    if (room.mode !== "race" || room.state !== "running") throw new HttpError(409, "Nothing to end");
    const now = this.clock.now();
    for (const p of room.players.values()) if (p.finishedAt === undefined) p.finishedAt = now;
    room.state = "finished";
    this.touch(room);
  }

  subscribe(room: Room, fn: () => void): () => void {
    room.listeners.add(fn);
    return () => room.listeners.delete(fn);
  }

  snapshot(room: Room, playerId: string | null): RoomSnapshot {
    const me = playerId ? room.players.get(playerId) : undefined;
    const snap: RoomSnapshot = {
      code: room.code,
      mode: room.mode,
      state: room.state,
      questionSeconds: room.questionSeconds,
      quiz: { id: room.quiz.id, title: room.quiz.title, questionCount: room.quiz.questions.length },
      host: room.players.get(room.hostPlayerId)?.nickname ?? "",
      you: me ? { id: me.id, isHost: me.id === room.hostPlayerId, answered: Object.keys(me.answers) } : null,
      players: [...room.players.values()].map((p) => this.view(room, p)),
    };
    if (room.state === "countdown") snap.countdownEndsAt = room.countdownEndsAt;
    if (room.mode === "sync" && (room.state === "question" || room.state === "reveal")) {
      const q = room.quiz.questions[room.currentIndex];
      snap.question = {
        index: room.currentIndex,
        id: q.id,
        prompt: q.prompt,
        type: q.type,
        options: q.type === "mc" ? q.options : undefined,
        endsAt: room.questionStartedAt + room.questionSeconds * 1000,
      };
      if (room.state === "reveal") {
        snap.reveal = { questionId: q.id, answer: q.answer, explanation: q.explanation, scoreboard: this.ranking(room) };
      }
    }
    if (room.state === "finished") snap.ranking = this.ranking(room);
    return snap;
  }

  /** Deletes rooms idle longer than maxIdleMs and cancels their timers. Returns how many. */
  sweep(maxIdleMs: number): number {
    const cutoff = this.clock.now() - maxIdleMs;
    let removed = 0;
    for (const [code, room] of this.rooms) {
      if (room.lastActivity < cutoff) {
        room.cancelTimer?.();
        this.rooms.delete(code);
        removed++;
      }
    }
    return removed;
  }

  private view(room: Room, p: Player): RoomPlayerView {
    const base: RoomPlayerView = { id: p.id, nickname: p.nickname, answered: Object.keys(p.answers).length, finished: p.finishedAt !== undefined };
    if (room.mode === "race") {
      if (p.finishedAt !== undefined) {
        base.correct = p.correct;
        base.durationMs = p.finishedAt - room.runningSince;
      }
      return base;
    }
    base.points = p.points;
    base.lastPoints = p.lastPoints;
    return base;
  }

  private ranking(room: Room): RoomPlayerView[] {
    const players = [...room.players.values()];
    if (room.mode === "race") {
      players.sort((a, b) => b.correct - a.correct || (a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity));
    } else {
      players.sort((a, b) => b.points - a.points || (a.lastCorrectAt ?? Infinity) - (b.lastCorrectAt ?? Infinity));
    }
    return players.map((p) => this.view(room, p));
  }

  private showQuestion(room: Room, index: number): void {
    room.cancelTimer?.();
    room.state = "question";
    room.currentIndex = index;
    room.questionStartedAt = this.clock.now();
    for (const p of room.players.values()) p.lastPoints = 0;
    room.cancelTimer = this.clock.schedule(() => this.reveal(room), room.questionSeconds * 1000);
    this.touch(room);
  }

  private reveal(room: Room): void {
    if (room.state !== "question") return;
    room.cancelTimer?.();
    room.cancelTimer = undefined;
    room.state = "reveal";
    this.touch(room);
  }

  private correctCount(room: Room, player: Player): number {
    const answers: Answers = {};
    for (const [id, a] of Object.entries(player.answers)) answers[id] = a.value;
    return grade(room.quiz.questions, answers).correct;
  }

  private touch(room: Room): void {
    room.lastActivity = this.clock.now();
    for (const fn of room.listeners) fn();
  }

  private requireHost(room: Room, playerId: string): void {
    if (room.hostPlayerId !== playerId) throw new HttpError(403, "Only the host can do that");
  }

  private requirePlayer(room: Room, playerId: string): Player {
    const p = room.players.get(playerId);
    if (!p) throw new HttpError(403, "You are not in this room");
    return p;
  }

  private newCode(): string {
    for (;;) {
      const bytes = randomBytes(6);
      let code = "";
      for (let i = 0; i < 6; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
      if (!this.rooms.has(code)) return code;
    }
  }
}
```

Note on the race ranking: the spec orders by `durationMs ASC`, and since every finished player shares `runningSince`, ordering by `finishedAt` is the same thing.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS. Then `npx tsc -p tsconfig.server.json` and `npx tsc -p tsconfig.json` clean.

- [ ] **Step 6: Commit**

```bash
git add shared/types.ts server/rooms.ts server/test/rooms.test.ts
git commit -m "Add the in-memory room state machine for race and synchronized play

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BxXovJBHEBSQVrspo5Wc4G"
```

---

### Task 2: Room HTTP and SSE routes

**Files:**
- Create: `server/routes/rooms.ts`, `server/test/rooms-http.test.ts`
- Modify: `server/app.ts`, `server/index.ts`, `server/test/helpers.ts`

**Interfaces:**
- Consumes: `RoomStore`, `newPlayerId`, `getQuizRow`, `idParam`, `HttpError`, `getUser`, `requireUser`, `requireMe`, `parseCookies`, `cookieOptions`, `stripAnswers`.
- Produces: `createApp(db, config, store = new RoomStore())`. Routes: `POST /api/rooms`, `GET /api/rooms/:code`, `POST /api/rooms/:code/join`, `GET /api/rooms/:code/events` (SSE), `GET /api/rooms/:code/questions`, `POST /api/rooms/:code/start|answer|next|end`. The player cookie is `rp`.

- [ ] **Step 1: Write the failing test**

Create `server/test/rooms-http.test.ts`:

```ts
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { api, asUser, sampleQuestions, startServer, type TestServer } from "./helpers.ts";

function playerCookie(headers: Headers): string {
  const set = headers.get("set-cookie") ?? "";
  const m = set.match(/rp=([0-9a-f]{32})/);
  assert.ok(m, `no rp cookie in ${set}`);
  return `rp=${m![1]}`;
}

async function firstEvent(base: string, path: string, cookie: string): Promise<{ status: number; data: any }> {
  const res = await fetch(base + path, { headers: { Cookie: cookie } });
  if (res.status !== 200) return { status: res.status, data: null };
  const reader = res.body!.getReader();
  const { value } = await reader.read();
  await reader.cancel();
  const text = new TextDecoder().decode(value);
  return { status: 200, data: JSON.parse(text.replace(/^data: /, "").trim()) };
}

describe("room routes", () => {
  let t: TestServer;
  let alice: { id: number; cookie: string };
  let bob: { id: number; cookie: string };
  let quizId: number;
  before(async () => {
    t = await startServer();
    alice = asUser(t.db, "alice");
    bob = asUser(t.db, "bob");
    const r = await api(t.base, "POST", "/api/quizzes", { title: "Room quiz", questions: sampleQuestions }, alice.cookie);
    quizId = r.json.id;
    await api(t.base, "POST", `/api/quizzes/${quizId}/publish`, undefined, alice.cookie);
  });
  after(() => t.close());

  it("requires sign-in and a published quiz to create", async () => {
    const anon = await api(t.base, "POST", "/api/rooms", { quizId, mode: "race" });
    assert.equal(anon.status, 401);
    const draft = await api(t.base, "POST", "/api/quizzes", { title: "Draft", questions: sampleQuestions }, alice.cookie);
    const bad = await api(t.base, "POST", "/api/rooms", { quizId: draft.json.id, mode: "race" }, alice.cookie);
    assert.equal(bad.status, 404);
    const mode = await api(t.base, "POST", "/api/rooms", { quizId, mode: "duel" }, alice.cookie);
    assert.equal(mode.status, 400);
  });

  it("creates a room, seats the host, lets others join, and streams snapshots", async () => {
    const created = await api(t.base, "POST", "/api/rooms", { quizId, mode: "sync", questionSeconds: 10 }, alice.cookie);
    assert.equal(created.status, 201);
    const code: string = created.json.code;
    assert.match(code, /^[A-Z2-9]{6}$/);
    const hostRp = playerCookie(created.headers);

    const info = await api(t.base, "GET", `/api/rooms/${code}`);
    assert.deepEqual(info.json, { state: "lobby", mode: "sync", you: null });
    const infoHost = await api(t.base, "GET", `/api/rooms/${code}`, undefined, `${alice.cookie}; ${hostRp}`);
    assert.equal(infoHost.json.you.isHost, true);

    const stranger = await firstEvent(t.base, `/api/rooms/${code}/events`, "");
    assert.equal(stranger.status, 403);

    const joined = await api(t.base, "POST", `/api/rooms/${code}/join`, { nickname: "bobby" });
    assert.equal(joined.status, 200);
    const bobRp = playerCookie(joined.headers);
    const dup = await api(t.base, "POST", `/api/rooms/${code}/join`, { nickname: "BOBBY" });
    assert.equal(dup.status, 400);
    const again = await api(t.base, "POST", `/api/rooms/${code}/join`, { nickname: "other" }, bobRp);
    assert.equal(again.status, 200); // already seated, no-op

    const snap = await firstEvent(t.base, `/api/rooms/${code}/events`, bobRp);
    assert.equal(snap.status, 200);
    assert.equal(snap.data.state, "lobby");
    assert.equal(snap.data.you.isHost, false);
    assert.deepEqual(snap.data.players.map((p: { nickname: string }) => p.nickname), ["alice", "bobby"]);

    const notHost = await api(t.base, "POST", `/api/rooms/${code}/start`, undefined, bobRp);
    assert.equal(notHost.status, 403);
    const start = await api(t.base, "POST", `/api/rooms/${code}/start`, undefined, hostRp);
    assert.equal(start.status, 200);
    const running = await firstEvent(t.base, `/api/rooms/${code}/events`, bobRp);
    assert.equal(running.data.state, "question");
    assert.equal(running.data.question.id, "Q1");
    assert.ok(!("answer" in running.data.question));

    const late = await api(t.base, "POST", `/api/rooms/${code}/join`, { nickname: "late" });
    assert.equal(late.status, 409);

    const wrong = await api(t.base, "POST", `/api/rooms/${code}/answer`, { questionId: "Q1", value: "x" }, bobRp);
    assert.equal(wrong.status, 400);
    const ans = await api(t.base, "POST", `/api/rooms/${code}/answer`, { questionId: "Q1", value: 1 }, bobRp);
    assert.deepEqual(ans.json, { ok: true });
    const ans2 = await api(t.base, "POST", `/api/rooms/${code}/answer`, { questionId: "Q1", value: 1 }, hostRp);
    assert.equal(ans2.status, 200);
    const reveal = await firstEvent(t.base, `/api/rooms/${code}/events`, bobRp);
    assert.equal(reveal.data.state, "reveal");
    assert.equal(reveal.data.reveal.answer, 1);
    const qs = await api(t.base, "GET", `/api/rooms/${code}/questions`, undefined, bobRp);
    assert.equal(qs.status, 409); // sync rooms do not serve the list
  });

  it("serves stripped questions to race members once running and returns results on the last answer", async () => {
    const created = await api(t.base, "POST", "/api/rooms", { quizId, mode: "race" }, bob.cookie);
    const code: string = created.json.code;
    const hostRp = playerCookie(created.headers);
    const early = await api(t.base, "GET", `/api/rooms/${code}/questions`, undefined, hostRp);
    assert.equal(early.status, 409);
    await api(t.base, "POST", `/api/rooms/${code}/start`, undefined, hostRp);
    await new Promise((r) => setTimeout(r, 3200));
    const qs = await api(t.base, "GET", `/api/rooms/${code}/questions`, undefined, hostRp);
    assert.equal(qs.status, 200);
    assert.ok(!("answer" in qs.json[0]));
    const a1 = await api(t.base, "POST", `/api/rooms/${code}/answer`, { questionId: "Q1", value: 1 }, hostRp);
    assert.deepEqual(a1.json, { finished: false });
    const a2 = await api(t.base, "POST", `/api/rooms/${code}/answer`, { questionId: "Q2", value: true }, hostRp);
    assert.equal(a2.json.finished, true);
    assert.equal(a2.json.correct, 2);
    assert.equal(a2.json.questions[0].answer, 1);
    const done = await api(t.base, "GET", `/api/rooms/${code}`, undefined, hostRp);
    assert.equal(done.json.state, "finished");
  });

  it("404s unknown codes", async () => {
    const r = await api(t.base, "GET", "/api/rooms/ZZZZZZ");
    assert.equal(r.status, 404);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test server/test/rooms-http.test.ts`
Expected: FAIL, `POST /api/rooms` returns 404 "Not found".

- [ ] **Step 3: Create server/routes/rooms.ts**

```ts
import express from "express";
import type { Request, Response } from "express";
import type { Db } from "../db.ts";
import { cookieOptions, getUser, parseCookies, requireMe, requireUser } from "../auth.ts";
import { HttpError, idParam } from "../http.ts";
import { getQuizRow } from "../cards.ts";
import { RoomStore, newPlayerId, type Room } from "../rooms.ts";
import { stripAnswers } from "../../shared/grade.ts";
import type { Question } from "../../shared/types.ts";

export const PLAYER_COOKIE = "rp";
const PLAYER_COOKIE_MS = 24 * 60 * 60 * 1000;

export function roomRoutes(db: Db, store: RoomStore, production: boolean): express.Router {
  const r = express.Router();

  const playerIdOf = (req: Request): string | undefined => {
    const v = parseCookies(req.headers.cookie)[PLAYER_COOKIE];
    return v && /^[0-9a-f]{32}$/.test(v) ? v : undefined;
  };

  const ensurePlayerId = (req: Request, res: Response): string => {
    let id = playerIdOf(req);
    if (!id) {
      id = newPlayerId();
      res.cookie(PLAYER_COOKIE, id, cookieOptions(production, PLAYER_COOKIE_MS));
    }
    return id;
  };

  const roomOf = (req: Request): Room => {
    const room = store.get(String(req.params.code));
    if (!room) throw new HttpError(404, "Room not found or expired");
    return room;
  };

  const memberOf = (req: Request): { room: Room; pid: string } => {
    const room = roomOf(req);
    const pid = playerIdOf(req);
    if (!pid || !room.players.has(pid)) throw new HttpError(403, "You are not in this room");
    return { room, pid };
  };

  r.post("/rooms", requireUser, (req, res) => {
    const me = requireMe(res);
    const body = (req.body ?? {}) as { quizId?: unknown; mode?: unknown; questionSeconds?: unknown };
    const row = getQuizRow(db, idParam(body.quizId));
    if (!row.published) throw new HttpError(404, "Not found");
    if (body.mode !== "race" && body.mode !== "sync") throw new HttpError(400, "mode must be race or sync");
    const seconds = body.questionSeconds === undefined ? 20 : Number(body.questionSeconds);
    const pid = ensurePlayerId(req, res);
    const room = store.create(
      { playerId: pid, nickname: me.username, userId: me.id },
      { id: row.id, title: row.title, questions: JSON.parse(row.questions) as Question[] },
      body.mode,
      seconds
    );
    res.status(201).json({ code: room.code });
  });

  r.get("/rooms/:code", (req, res) => {
    const room = roomOf(req);
    const pid = playerIdOf(req);
    const you = pid && room.players.has(pid) ? { id: pid, isHost: pid === room.hostPlayerId } : null;
    res.json({ state: room.state, mode: room.mode, you });
  });

  r.post("/rooms/:code/join", (req, res) => {
    const room = roomOf(req);
    const pid = ensurePlayerId(req, res);
    const nickname = String((req.body as { nickname?: unknown } | null)?.nickname ?? "");
    store.join(room, pid, nickname, getUser(res)?.id);
    res.json({ ok: true });
  });

  r.get("/rooms/:code/events", (req, res) => {
    const { room, pid } = memberOf(req);
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    const send = () => {
      res.write(`data: ${JSON.stringify(store.snapshot(room, pid))}\n\n`);
    };
    send();
    const unsubscribe = store.subscribe(room, send);
    const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 25_000);
    req.on("close", () => {
      unsubscribe();
      clearInterval(heartbeat);
    });
  });

  r.get("/rooms/:code/questions", (req, res) => {
    const { room } = memberOf(req);
    if (room.mode !== "race" || room.state === "lobby" || room.state === "countdown") {
      throw new HttpError(409, "Questions are not available yet");
    }
    res.json(stripAnswers(room.quiz.questions));
  });

  r.post("/rooms/:code/start", (req, res) => {
    const { room, pid } = memberOf(req);
    store.start(room, pid);
    res.json({ ok: true });
  });

  r.post("/rooms/:code/answer", (req, res) => {
    const { room, pid } = memberOf(req);
    const body = req.body as { questionId?: unknown; value?: unknown } | null;
    if (typeof body?.questionId !== "string" || (typeof body.value !== "number" && typeof body.value !== "boolean")) {
      throw new HttpError(400, "questionId and value are required");
    }
    res.json(store.answer(room, pid, body.questionId, body.value));
  });

  r.post("/rooms/:code/next", (req, res) => {
    const { room, pid } = memberOf(req);
    store.next(room, pid);
    res.json({ ok: true });
  });

  r.post("/rooms/:code/end", (req, res) => {
    const { room, pid } = memberOf(req);
    store.end(room, pid);
    res.json({ ok: true });
  });

  return r;
}
```

- [ ] **Step 4: Wire the store through app.ts, index.ts, and the test helper**

`server/app.ts`: add `import { RoomStore } from "./rooms.ts";` and `import { roomRoutes } from "./routes/rooms.ts";`. Change the signature to `export function createApp(db: Db, config: Config, store: RoomStore = new RoomStore()): express.Express` and add `app.use("/api", roomRoutes(db, store, config.production));` after the tag routes.

`server/index.ts`: add `import { RoomStore } from "./rooms.ts";`, create `const store = new RoomStore();` before `createApp`, pass it as the third argument, and after the `app.listen(...)` call add:

```ts
// Rooms idle for two hours are dropped every five minutes.
setInterval(() => store.sweep(2 * 60 * 60 * 1000), 5 * 60 * 1000).unref();
```

`server/test/helpers.ts`: no change is required (the default store is created per app), but the `api` helper must forward `Set-Cookie`; it already returns `headers`, which the test reads.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS. The race test waits 3.2 seconds for the real countdown; that is intended. Then `npx tsc -p tsconfig.server.json` clean.

- [ ] **Step 6: Commit**

```bash
git add server/routes/rooms.ts server/app.ts server/index.ts server/test/rooms-http.test.ts
git commit -m "Add room routes with server-sent snapshots

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BxXovJBHEBSQVrspo5Wc4G"
```

---

### Task 3: Room creation page and host link

**Files:**
- Create: `src/pages/RoomNew.tsx`
- Modify: `src/api.ts`, `src/pages/Quiz.tsx`, `src/router.tsx`

**Interfaces:**
- Produces in `src/api.ts`: `createRoom({ quizId, mode, questionSeconds })`, `getRoom(code)`, `joinRoom(code, nickname)`, `roomQuestions(code)`, `roomStart(code)`, `roomAnswer(code, questionId, value)`, `roomNext(code)`, `roomEnd(code)`, and the type `RoomAnswerResponse`.

- [ ] **Step 1: Extend src/api.ts**

Add `RoomMode`, `RoomState`, `PlayQuestion` (already there), `Question` to the type import from `../shared/types.ts`. Append:

```ts
export type RoomAnswerResponse =
  | { ok: true }
  | { finished: false }
  | { finished: true; correct: number; total: number; durationMs: number; questions: Question[] };

export const createRoom = (input: { quizId: number; mode: RoomMode; questionSeconds?: number }) =>
  request<{ code: string }>("POST", "/api/rooms", input);
export const getRoom = (code: string) =>
  request<{ state: RoomState; mode: RoomMode; you: { id: string; isHost: boolean } | null }>("GET", `/api/rooms/${encodeURIComponent(code)}`);
export const joinRoom = (code: string, nickname: string) => request<{ ok: true }>("POST", `/api/rooms/${encodeURIComponent(code)}/join`, { nickname });
export const roomQuestions = (code: string) => request<PlayQuestion[]>("GET", `/api/rooms/${encodeURIComponent(code)}/questions`);
export const roomStart = (code: string) => request<{ ok: true }>("POST", `/api/rooms/${encodeURIComponent(code)}/start`);
export const roomAnswer = (code: string, questionId: string, value: number | boolean) =>
  request<RoomAnswerResponse>("POST", `/api/rooms/${encodeURIComponent(code)}/answer`, { questionId, value });
export const roomNext = (code: string) => request<{ ok: true }>("POST", `/api/rooms/${encodeURIComponent(code)}/next`);
export const roomEnd = (code: string) => request<{ ok: true }>("POST", `/api/rooms/${encodeURIComponent(code)}/end`);
```

- [ ] **Step 2: Create src/pages/RoomNew.tsx**

```tsx
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { RoomMode } from "../../shared/types.ts";
import { createRoom, getQuiz, type QuizDetail } from "../api.ts";
import { useMe } from "../me.tsx";
import { ErrorBox } from "../components/ErrorBox.tsx";

export function RoomNew() {
  const [params] = useSearchParams();
  const quizId = Number(params.get("quiz"));
  const navigate = useNavigate();
  const { me, loading } = useMe();
  const [quiz, setQuiz] = useState<QuizDetail | null>(null);
  const [mode, setMode] = useState<RoomMode>("race");
  const [seconds, setSeconds] = useState(20);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !me) window.location.href = "/api/auth/github";
  }, [loading, me]);

  useEffect(() => {
    let alive = true;
    getQuiz(quizId)
      .then((q) => alive && setQuiz(q))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [quizId]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const { code } = await createRoom({ quizId, mode, questionSeconds: mode === "sync" ? seconds : undefined });
      navigate(`/r/${code}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !quiz) return <ErrorBox message={error} />;
  if (!quiz) return <p className="text-neutral-400">Loading…</p>;

  return (
    <div className="max-w-xl mx-auto bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
      <h1 className="text-2xl font-semibold">Host a room</h1>
      <p className="mt-1 text-neutral-400">
        {quiz.title} · {quiz.questionCount} questions
      </p>
      <div className="mt-6 space-y-3">
        {(
          [
            ["race", "Race", "Everyone starts together and answers at their own pace. Most correct wins, fastest breaks ties."],
            ["sync", "Synchronized", "One question at a time with a timer. Faster correct answers score more."],
          ] as const
        ).map(([value, label, help]) => (
          <label key={value} className={`block rounded-xl border p-4 cursor-pointer ${mode === value ? "border-emerald-500 bg-emerald-500/10" : "border-neutral-800 hover:border-neutral-700"}`}>
            <div className="flex items-center gap-3">
              <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="accent-emerald-500" />
              <span className="font-medium">{label}</span>
            </div>
            <p className="mt-1 text-sm text-neutral-400">{help}</p>
          </label>
        ))}
      </div>
      {mode === "sync" && (
        <label className="block mt-4 text-sm text-neutral-300">
          Seconds per question
          <input
            type="number"
            min={5}
            max={120}
            value={seconds}
            onChange={(e) => setSeconds(Math.min(120, Math.max(5, Number(e.target.value) || 20)))}
            className="mt-1 w-32 bg-neutral-950 border border-neutral-800 rounded-xl p-2 text-sm"
          />
        </label>
      )}
      {error && <ErrorBox message={error} />}
      <button disabled={busy} onClick={() => void create()} className="mt-6 rounded-xl px-6 py-2 bg-emerald-600 hover:bg-emerald-500 font-medium disabled:opacity-50">
        Create room
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Host link on the quiz page and routes**

In `src/pages/Quiz.tsx`, inside the actions row, directly after the Play link block, add:

```tsx
        {isPublished && me && (
          <Link to={`/rooms/new?quiz=${quiz.id}`} className={`${btn} bg-neutral-800 hover:bg-neutral-700`}>
            Host a room
          </Link>
        )}
```

In `src/router.tsx`, import `RoomNew` and `Room` (the `Room` page is created in Task 4; add both routes now and create a placeholder `src/pages/Room.tsx` that renders `<p className="text-neutral-400">Room</p>` so the build passes; Task 4 replaces it). Add before the `*` route:

```tsx
      { path: "rooms/new", element: <RoomNew /> },
      { path: "r/:code", element: <Room /> },
```

- [ ] **Step 4: Build and lint**

Run: `npm run build` (clean) and `npm run lint` (zero errors).

- [ ] **Step 5: Commit**

```bash
git add src/api.ts src/pages/RoomNew.tsx src/pages/Room.tsx src/pages/Quiz.tsx src/router.tsx
git commit -m "Add the room creation page and host link

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BxXovJBHEBSQVrspo5Wc4G"
```

---

### Task 4: Room page

**Files:**
- Modify: `src/pages/Room.tsx` (replace the placeholder), `src/components/QuestionPage.tsx` (optional `hidePrev` prop that leaves the Previous button out), `README.md`

**Interfaces:**
- Consumes: the room API functions, `RoomSnapshot`, `QuestionPage`, `ResultsView`, `ErrorBox`, `formatDuration`.
- `QuestionPage` gains `hidePrev?: boolean`; when set, the Previous button is not rendered. Race mode passes it because answers are final.

- [ ] **Step 1: Write src/pages/Room.tsx**

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { Answers, PlayQuestion, Question, RoomPlayerView, RoomSnapshot } from "../../shared/types.ts";
import { ApiError, createRoom, getRoom, joinRoom, roomAnswer, roomEnd, roomNext, roomQuestions, roomStart } from "../api.ts";
import { QuestionPage } from "../components/QuestionPage.tsx";
import { ResultsView } from "../components/ResultsView.tsx";
import { ErrorBox } from "../components/ErrorBox.tsx";
import { formatDuration } from "../format.ts";

const card = "bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl";
const btn = "rounded-xl px-4 py-2 transition disabled:opacity-50";

/** Ticks every 250 ms while `until` is in the future; returns whole seconds left. */
function useCountdown(until: number | undefined): number {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!until) return;
    const tick = () => setLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [until]);
  return left;
}

/** Remounts the view per room code, so "Play again" starts with fresh state. */
export function Room() {
  const { code = "" } = useParams();
  return <RoomView key={code} code={code} />;
}

function RoomView({ code }: { code: string }) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"loading" | "missing" | "join" | "live">("loading");
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [connected, setConnected] = useState(true);
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Race mode: the stripped question list, the player's own answers, and the graded results.
  const [questions, setQuestions] = useState<PlayQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [pending, setPending] = useState<number | boolean | undefined>(undefined);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<{ questions: Question[]; answers: Answers } | null>(null);
  const streamRef = useRef<EventSource | null>(null);

  const openStream = useCallback(() => {
    streamRef.current?.close();
    const es = new EventSource(`/api/rooms/${encodeURIComponent(code)}/events`);
    es.onmessage = (e) => {
      setSnapshot(JSON.parse(e.data) as RoomSnapshot);
      setConnected(true);
    };
    es.onerror = () => setConnected(false);
    streamRef.current = es;
    setPhase("live");
  }, [code]);

  useEffect(() => {
    let alive = true;
    getRoom(code)
      .then((info) => {
        if (!alive) return;
        if (info.you) openStream();
        else setPhase("join");
      })
      .catch((e: Error) => {
        if (!alive) return;
        setPhase(e instanceof ApiError && e.status === 404 ? "missing" : "join");
        if (!(e instanceof ApiError && e.status === 404)) setError(e.message);
      });
    return () => {
      alive = false;
      streamRef.current?.close();
    };
  }, [code, openStream]);

  // Race mode: fetch the questions once the race is running and pick up where we left off.
  useEffect(() => {
    if (!snapshot || snapshot.mode !== "race" || questions) return;
    if (snapshot.state !== "running" && snapshot.state !== "finished") return;
    let alive = true;
    roomQuestions(code)
      .then((qs) => {
        if (!alive) return;
        setQuestions(qs);
        const done = new Set(snapshot.you?.answered ?? []);
        const first = qs.findIndex((q) => !done.has(q.id));
        setIndex(first === -1 ? qs.length - 1 : first);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [snapshot, questions, code]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    await act(async () => {
      await joinRoom(code, nickname);
      openStream();
    });
  }

  async function submitRaceAnswer() {
    if (!questions || pending === undefined) return;
    const q = questions[index];
    await act(async () => {
      const r = await roomAnswer(code, q.id, pending);
      const nextAnswers = { ...answers, [q.id]: pending };
      setAnswers(nextAnswers);
      setPending(undefined);
      if ("finished" in r && r.finished) {
        setResults({ questions: r.questions, answers: nextAnswers });
      } else if (index < questions.length - 1) {
        setIndex(index + 1);
      }
    });
  }

  async function playAgain() {
    if (!snapshot) return;
    await act(async () => {
      const { code: next } = await createRoom({ quizId: snapshot.quiz.id, mode: snapshot.mode, questionSeconds: snapshot.questionSeconds });
      navigate(`/r/${next}`);
    });
  }

  const countdown = useCountdown(snapshot?.state === "countdown" ? snapshot.countdownEndsAt : undefined);
  const questionLeft = useCountdown(snapshot?.state === "question" ? snapshot.question?.endsAt : undefined);

  if (phase === "loading") return <p className="text-neutral-400">Loading…</p>;
  if (phase === "missing") {
    return (
      <div className={card}>
        <p>Room not found or expired.</p>
        <Link to="/" className="underline text-sm text-neutral-400">
          Back to the catalog
        </Link>
      </div>
    );
  }
  if (phase === "join") {
    return (
      <div className={`${card} max-w-md mx-auto`}>
        <h1 className="text-2xl font-semibold">Join room {code.toUpperCase()}</h1>
        <label className="block mt-4 text-sm text-neutral-300">
          Nickname
          <input
            value={nickname}
            maxLength={20}
            onChange={(e) => setNickname(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void join()}
            className="mt-1 w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-sm"
            autoFocus
          />
        </label>
        {error && <ErrorBox message={error} />}
        <button disabled={busy || !nickname.trim()} onClick={() => void join()} className={`${btn} mt-4 bg-emerald-600 hover:bg-emerald-500 font-medium`}>
          Join
        </button>
      </div>
    );
  }
  if (!snapshot) return <p className="text-neutral-400">Connecting…</p>;

  const isHost = snapshot.you?.isHost === true;
  const total = snapshot.quiz.questionCount;

  const board = (players: RoomPlayerView[], showPoints: boolean) => (
    <table className="w-full text-sm">
      <tbody>
        {players.map((p, i) => (
          <tr key={p.id} className="border-t border-neutral-800">
            <td className="py-1.5 pr-3 tabular-nums text-neutral-400">{i + 1}</td>
            <td className="py-1.5 pr-3">
              {p.nickname}
              {p.id === snapshot.you?.id && <span className="text-neutral-500"> (you)</span>}
            </td>
            <td className="py-1.5 pr-3 tabular-nums">
              {showPoints
                ? `${p.points ?? 0} pts${p.lastPoints ? ` (+${p.lastPoints})` : ""}`
                : p.finished
                  ? `${p.correct}/${total} in ${formatDuration(p.durationMs ?? 0)}`
                  : `${p.answered}/${total}`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between text-sm text-neutral-400">
        <span>
          Room <span className="font-mono text-neutral-200">{snapshot.code}</span> · {snapshot.quiz.title} · {snapshot.mode === "race" ? "Race" : "Synchronized"}
        </span>
        {!connected && <span className="text-amber-400">Reconnecting…</span>}
      </div>
      {error && <ErrorBox message={error} />}

      {snapshot.state === "lobby" && (
        <div className={card}>
          <h1 className="text-2xl font-semibold">Waiting for players</h1>
          <p className="mt-2 text-neutral-400">
            Share this code: <span className="font-mono text-3xl text-white tracking-widest">{snapshot.code}</span>
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {snapshot.players.map((p) => (
              <li key={p.id} className="rounded-md bg-neutral-800 px-2 py-1 text-sm">
                {p.nickname}
                {p.nickname === snapshot.host && <span className="text-neutral-500"> (host)</span>}
              </li>
            ))}
          </ul>
          {isHost ? (
            <button disabled={busy} onClick={() => void act(() => roomStart(code))} className={`${btn} mt-6 bg-emerald-600 hover:bg-emerald-500 font-medium`}>
              Start
            </button>
          ) : (
            <p className="mt-6 text-sm text-neutral-400">Waiting for {snapshot.host} to start.</p>
          )}
        </div>
      )}

      {snapshot.state === "countdown" && (
        <div className={`${card} text-center`}>
          <p className="text-neutral-400">Get ready</p>
          <p className="text-7xl font-bold tabular-nums">{countdown}</p>
        </div>
      )}

      {snapshot.mode === "race" && (snapshot.state === "running" || snapshot.state === "finished") && (
        <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
          <div>
            {results ? (
              <ResultsView questions={results.questions} answers={results.answers} onRestart={() => void playAgain()} onExit={() => navigate(`/quiz/${snapshot.quiz.id}`)} exitLabel="Back to quiz" />
            ) : snapshot.state === "finished" && !results ? (
              <div className={card}>
                <p>The host ended the race.</p>
              </div>
            ) : questions ? (
              <QuestionPage
                question={questions[index]}
                index={index}
                total={questions.length}
                value={pending}
                isAnswered={pending !== undefined}
                onChange={setPending}
                onPrev={() => undefined}
                hidePrev
                onNext={() => void submitRaceAnswer()}
                onFinish={() => void submitRaceAnswer()}
                onQuit={() => navigate(`/quiz/${snapshot.quiz.id}`)}
                quizMetadata={{ name: snapshot.quiz.title }}
                submitting={busy}
              />
            ) : (
              <p className="text-neutral-400">Loading questions…</p>
            )}
          </div>
          <aside className={card}>
            <h2 className="font-semibold mb-2">{snapshot.state === "finished" ? "Final ranking" : "Progress"}</h2>
            {board(snapshot.ranking ?? snapshot.players, false)}
            {isHost && snapshot.state === "running" && (
              <button disabled={busy} onClick={() => void act(() => roomEnd(code))} className={`${btn} mt-4 w-full bg-neutral-800 hover:bg-neutral-700 text-sm`}>
                End race
              </button>
            )}
            {isHost && snapshot.state === "finished" && (
              <button disabled={busy} onClick={() => void playAgain()} className={`${btn} mt-4 w-full bg-emerald-600 hover:bg-emerald-500 text-sm`}>
                Play again
              </button>
            )}
          </aside>
        </div>
      )}

      {snapshot.mode === "sync" && snapshot.state === "question" && snapshot.question && (
        <div className={card}>
          <div className="flex justify-between text-sm text-neutral-400 mb-2">
            <span>
              Question {snapshot.question.index + 1} of {total}
            </span>
            <span className="tabular-nums">{questionLeft}s</span>
          </div>
          <div className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden mb-4">
            <div className="h-full bg-emerald-500 transition-all duration-200" style={{ width: `${Math.min(100, (questionLeft / snapshot.questionSeconds) * 100)}%` }} />
          </div>
          <h2 className="text-2xl font-semibold mb-4">{snapshot.question.prompt}</h2>
          {snapshot.you?.answered.includes(snapshot.question.id) ? (
            <p className="text-neutral-400">Answered. Waiting for the others…</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {(snapshot.question.type === "mc" ? snapshot.question.options ?? [] : ["True", "False"]).map((label, i) => {
                const value = snapshot.question!.type === "mc" ? i : i === 0;
                return (
                  <button
                    key={i}
                    disabled={busy}
                    onClick={() => void act(() => roomAnswer(code, snapshot.question!.id, value))}
                    className="rounded-xl border border-neutral-800 bg-neutral-950 hover:border-emerald-500 p-4 text-left disabled:opacity-50"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
          <p className="mt-4 text-xs text-neutral-500">{snapshot.players.filter((p) => p.answered > (snapshot.question?.index ?? 0)).length} of {snapshot.players.length} answered</p>
        </div>
      )}

      {snapshot.mode === "sync" && snapshot.state === "reveal" && snapshot.question && snapshot.reveal && (
        <div className={card}>
          <p className="text-sm text-neutral-400">
            Question {snapshot.question.index + 1} of {total}
          </p>
          <h2 className="text-2xl font-semibold mt-1">{snapshot.question.prompt}</h2>
          <p className="mt-3">
            Correct answer:{" "}
            <span className="text-emerald-400 font-medium">
              {snapshot.question.type === "mc" ? snapshot.question.options?.[snapshot.reveal.answer as number] : snapshot.reveal.answer ? "True" : "False"}
            </span>
          </p>
          {snapshot.reveal.explanation && <p className="mt-1 text-neutral-300">{snapshot.reveal.explanation}</p>}
          <h3 className="mt-6 font-semibold mb-2">Scoreboard</h3>
          {board(snapshot.reveal.scoreboard, true)}
          {isHost && (
            <button disabled={busy} onClick={() => void act(() => roomNext(code))} className={`${btn} mt-6 bg-emerald-600 hover:bg-emerald-500 font-medium`}>
              {snapshot.question.index + 1 < total ? "Next question" : "Show final ranking"}
            </button>
          )}
        </div>
      )}

      {snapshot.mode === "sync" && snapshot.state === "finished" && (
        <div className={card}>
          <h1 className="text-2xl font-semibold mb-4">Final ranking</h1>
          {board(snapshot.ranking ?? snapshot.players, true)}
          <div className="mt-6 flex gap-3">
            {isHost && (
              <button disabled={busy} onClick={() => void playAgain()} className={`${btn} bg-emerald-600 hover:bg-emerald-500 font-medium`}>
                Play again
              </button>
            )}
            <Link to={`/quiz/${snapshot.quiz.id}`} className={`${btn} bg-neutral-800 hover:bg-neutral-700`}>
              Back to quiz
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: README**

In `README.md`, extend the feature sentence: `Vote quizzes up or down, filter by tag, compete on each quiz's leaderboard, or host a room and race your friends live.`

- [ ] **Step 3: Build and lint**

Run: `npm run build` (clean) and `npm run lint` (zero errors).

- [ ] **Step 4: Commit**

```bash
git add src/pages/Room.tsx README.md
git commit -m "Add the live room page for race and synchronized play

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BxXovJBHEBSQVrspo5Wc4G"
```

---

### Task 5: Phase 4 checklist

Run by the controller with the headless checklist script and two browser contexts (host signed in, a guest with only a nickname). Each must pass before the phase is called done:

1. Host a room from a quiz page: the lobby shows the 6-character code and the host's name. A guest opens `/r/CODE`, joins with a nickname, and both lobbies list both players. A second guest with the same nickname is refused.
2. Race: Start shows a countdown on both screens, then questions. The host's progress board moves as the guest answers. The guest's final answer shows results with correct answers. The host ends the race; the final ranking appears on both screens.
3. Refresh the guest mid-race: the seat is kept and play resumes at the first unanswered question.
4. Synchronized: Start shows question 1 with a timer on both screens. The guest answers; the host sees "1 of 2 answered". When the host answers, the reveal appears with the correct answer and the scoreboard with points. Next question; let the timer expire; the reveal shows zero points for the question. Show final ranking.
5. A late joiner after start gets "already started". An unknown code shows "Room not found or expired".
6. `npm test` passes (rooms and rooms-http suites included), `npm run build` and `npm run lint` are clean.
