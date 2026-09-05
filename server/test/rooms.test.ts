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
    assert.deepEqual(store.snapshot(room, bob).you!.answers, { Q1: 1 });
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
