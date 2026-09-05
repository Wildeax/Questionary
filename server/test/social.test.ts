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

  it("ignores attempts that were started but not submitted", async () => {
    const before = (await api(t.base, "GET", `/api/quizzes/${id}/leaderboard`)).json.length;
    const start = await api(t.base, "POST", `/api/quizzes/${id}/attempts`, undefined, dave.cookie);
    assert.equal(start.status, 201);
    const after = (await api(t.base, "GET", `/api/quizzes/${id}/leaderboard`)).json.length;
    assert.equal(after, before);
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

  it("bumps the version when the author edits while unpublished", async () => {
    await api(t.base, "POST", `/api/quizzes/${id}/unpublish`, undefined, alice.cookie);
    const changed = { title: "Board", questions: [{ ...sampleQuestions[0], answer: 1 }, sampleQuestions[1]] };
    const r = await api(t.base, "PUT", `/api/quizzes/${id}`, changed, alice.cookie);
    assert.equal(r.json.version, 3);
    await api(t.base, "POST", `/api/quizzes/${id}/publish`, undefined, alice.cookie);
    const board = await api(t.base, "GET", `/api/quizzes/${id}/leaderboard`);
    assert.deepEqual(board.json, []);
  });

  it("hides drafts", async () => {
    const d = await api(t.base, "POST", "/api/quizzes", { title: "Draft", questions: sampleQuestions }, alice.cookie);
    const r = await api(t.base, "GET", `/api/quizzes/${d.json.id}/leaderboard`);
    assert.equal(r.status, 404);
  });
});
