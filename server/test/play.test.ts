import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { api, asUser, sampleQuestions, startServer, type TestServer } from "./helpers.ts";

describe("play routes", () => {
  let t: TestServer;
  let alice: { id: number; cookie: string };
  let bob: { id: number; cookie: string };
  let id: number;
  before(async () => {
    t = await startServer();
    alice = asUser(t.db, "alice");
    bob = asUser(t.db, "bob");
    const r = await api(t.base, "POST", "/api/quizzes", { title: "T", questions: sampleQuestions }, alice.cookie);
    id = r.json.id;
  });
  after(() => t.close());

  it("does not serve drafts", async () => {
    const r = await api(t.base, "GET", `/api/quizzes/${id}/play`);
    assert.equal(r.status, 404);
  });

  it("serves stripped questions once published", async () => {
    await api(t.base, "POST", `/api/quizzes/${id}/publish`, undefined, alice.cookie);
    const r = await api(t.base, "GET", `/api/quizzes/${id}/play`);
    assert.equal(r.status, 200);
    assert.equal(r.json.version, 1);
    assert.equal(r.json.title, "T");
    assert.equal(r.json.author.username, "alice");
    assert.equal(r.json.questions.length, 2);
    assert.ok(!("answer" in r.json.questions[0]));
    assert.ok(!("explanation" in r.json.questions[0]));
    assert.deepEqual(r.json.questions[0].options, ["A", "B", "C"]);
  });

  it("grades anonymously without storing", async () => {
    const r = await api(t.base, "POST", `/api/quizzes/${id}/grade`, { answers: { Q1: 1, Q2: false } });
    assert.equal(r.status, 200);
    assert.equal(r.json.correct, 1);
    assert.equal(r.json.total, 2);
    assert.equal(r.json.durationMs, null);
    assert.equal(r.json.questions[0].answer, 1);
    assert.equal(r.json.questions[0].explanation, "B it is");
    const n = t.db.prepare("SELECT COUNT(*) AS n FROM attempts").get()!.n;
    assert.equal(n, 0);
  });

  it("rejects a bad answers body", async () => {
    const r = await api(t.base, "POST", `/api/quizzes/${id}/grade`, { answers: [1] });
    assert.equal(r.status, 400);
  });

  it("starts and submits an attempt for a signed-in user", async () => {
    const start = await api(t.base, "POST", `/api/quizzes/${id}/attempts`, undefined, bob.cookie);
    assert.equal(start.status, 201);
    assert.equal(typeof start.json.attemptId, "number");
    assert.ok(!("answer" in start.json.questions[0]));
    const submit = await api(t.base, "POST", `/api/attempts/${start.json.attemptId}`, { answers: { Q1: 1, Q2: true } }, bob.cookie);
    assert.equal(submit.status, 200);
    assert.equal(submit.json.correct, 2);
    assert.equal(typeof submit.json.durationMs, "number");
    assert.equal(submit.json.questions[1].answer, true);
    const again = await api(t.base, "POST", `/api/attempts/${start.json.attemptId}`, { answers: {} }, bob.cookie);
    assert.equal(again.status, 409);
    const card = await api(t.base, "GET", `/api/quizzes/${id}`);
    assert.equal(card.json.plays, 1);
  });

  it("hides other people's attempts", async () => {
    const start = await api(t.base, "POST", `/api/quizzes/${id}/attempts`, undefined, bob.cookie);
    const r = await api(t.base, "POST", `/api/attempts/${start.json.attemptId}`, { answers: {} }, alice.cookie);
    assert.equal(r.status, 404);
  });

  it("requires sign-in to start an attempt", async () => {
    const r = await api(t.base, "POST", `/api/quizzes/${id}/attempts`);
    assert.equal(r.status, 401);
  });

  it("returns 409 when the quiz version moved", async () => {
    const start = await api(t.base, "POST", `/api/quizzes/${id}/attempts`, undefined, bob.cookie);
    const changed = { title: "T", questions: [{ ...sampleQuestions[0], answer: 0 }, sampleQuestions[1]] };
    await api(t.base, "PUT", `/api/quizzes/${id}`, changed, alice.cookie);
    const r = await api(t.base, "POST", `/api/attempts/${start.json.attemptId}`, { answers: { Q1: 1 } }, bob.cookie);
    assert.equal(r.status, 409);
    assert.match(r.json.error, /updated/);
  });
});
