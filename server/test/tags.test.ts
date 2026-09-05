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
