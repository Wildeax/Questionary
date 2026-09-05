import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { api, asUser, sampleQuestions, startServer, type TestServer } from "./helpers.ts";

describe("user routes", () => {
  let t: TestServer;
  let alice: { id: number; cookie: string };
  before(async () => {
    t = await startServer();
    alice = asUser(t.db, "Alice");
    const draft = await api(t.base, "POST", "/api/quizzes", { title: "Draft", questions: sampleQuestions }, alice.cookie);
    const pub = await api(t.base, "POST", "/api/quizzes", { title: "Live", questions: sampleQuestions }, alice.cookie);
    await api(t.base, "POST", `/api/quizzes/${pub.json.id}/publish`, undefined, alice.cookie);
    assert.equal(draft.status, 201);
  });
  after(() => t.close());

  it("shows a profile with published quizzes only, case-insensitive", async () => {
    const r = await api(t.base, "GET", "/api/users/alice");
    assert.equal(r.status, 200);
    assert.equal(r.json.username, "Alice");
    assert.equal(typeof r.json.createdAt, "number");
    assert.deepEqual(r.json.quizzes.map((q: { title: string }) => q.title), ["Live"]);
  });

  it("404s an unknown user", async () => {
    const r = await api(t.base, "GET", "/api/users/nobody");
    assert.equal(r.status, 404);
  });

  it("requires sign-in for /api/me/quizzes", async () => {
    const r = await api(t.base, "GET", "/api/me/quizzes");
    assert.equal(r.status, 401);
  });

  it("splits drafts and published for the signed-in user", async () => {
    const r = await api(t.base, "GET", "/api/me/quizzes", undefined, alice.cookie);
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.drafts.map((q: { title: string }) => q.title), ["Draft"]);
    assert.deepEqual(r.json.published.map((q: { title: string }) => q.title), ["Live"]);
  });
});
