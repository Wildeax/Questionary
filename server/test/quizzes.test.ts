import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { api, asUser, sampleQuestions, startServer, type TestServer } from "./helpers.ts";

describe("quiz routes", () => {
  let t: TestServer;
  let alice: { id: number; cookie: string };
  let bob: { id: number; cookie: string };
  let admin: { id: number; cookie: string };
  before(async () => {
    t = await startServer();
    alice = asUser(t.db, "alice");
    bob = asUser(t.db, "bob");
    admin = asUser(t.db, "admin");
  });
  after(() => t.close());

  const body = { title: "Unity basics", description: "Warm-up", tags: ["Unity", "C Sharp"], questions: sampleQuestions };

  it("requires sign-in to create", async () => {
    const r = await api(t.base, "POST", "/api/quizzes", body);
    assert.equal(r.status, 401);
  });

  it("rejects an invalid body with the validator message", async () => {
    const r = await api(t.base, "POST", "/api/quizzes", { ...body, title: "" }, alice.cookie);
    assert.equal(r.status, 400);
    assert.match(r.json.error, /Title must be/);
  });

  let id: number;
  it("creates a draft visible only to its author", async () => {
    const r = await api(t.base, "POST", "/api/quizzes", body, alice.cookie);
    assert.equal(r.status, 201);
    id = r.json.id;
    const mine = await api(t.base, "GET", `/api/quizzes/${id}`, undefined, alice.cookie);
    assert.equal(mine.status, 200);
    assert.equal(mine.json.published, false);
    assert.equal(mine.json.version, 1);
    assert.equal(mine.json.questions.length, 2);
    assert.deepEqual(mine.json.tags.sort(), ["c-sharp", "unity"]);
    const anon = await api(t.base, "GET", `/api/quizzes/${id}`);
    assert.equal(anon.status, 404);
    const other = await api(t.base, "GET", `/api/quizzes/${id}`, undefined, bob.cookie);
    assert.equal(other.status, 404);
  });

  it("does not list drafts", async () => {
    const r = await api(t.base, "GET", "/api/quizzes");
    assert.equal(r.json.items.length, 0);
  });

  it("publishes and then lists, strips answers for others", async () => {
    const p = await api(t.base, "POST", `/api/quizzes/${id}/publish`, undefined, alice.cookie);
    assert.equal(p.status, 200);
    const list = await api(t.base, "GET", "/api/quizzes");
    assert.equal(list.json.items.length, 1);
    assert.equal(list.json.items[0].title, "Unity basics");
    assert.equal(list.json.items[0].questionCount, 2);
    assert.equal(list.json.items[0].author.username, "alice");
    assert.equal(list.json.hasMore, false);
    const anon = await api(t.base, "GET", `/api/quizzes/${id}`);
    assert.equal(anon.status, 200);
    assert.equal(anon.json.questions, undefined);
    assert.equal(anon.json.score, 0);
    assert.equal(anon.json.plays, 0);
  });

  it("searches by text and filters by tag", async () => {
    const hit = await api(t.base, "GET", "/api/quizzes?q=warm");
    assert.equal(hit.json.items.length, 1);
    const miss = await api(t.base, "GET", "/api/quizzes?q=zzz");
    assert.equal(miss.json.items.length, 0);
    const tagged = await api(t.base, "GET", "/api/quizzes?tag=c-sharp");
    assert.equal(tagged.json.items.length, 1);
    const untagged = await api(t.base, "GET", "/api/quizzes?tag=python");
    assert.equal(untagged.json.items.length, 0);
  });

  it("keeps the version when questions do not change", async () => {
    const r = await api(t.base, "PUT", `/api/quizzes/${id}`, { ...body, title: "Unity basics 2" }, alice.cookie);
    assert.equal(r.status, 200);
    assert.equal(r.json.version, 1);
  });

  it("bumps the version when questions change on a published quiz", async () => {
    const changed = { ...body, title: "Unity basics 2", questions: [{ ...sampleQuestions[0], answer: 2 }, sampleQuestions[1]] };
    const r = await api(t.base, "PUT", `/api/quizzes/${id}`, changed, alice.cookie);
    assert.equal(r.status, 200);
    assert.equal(r.json.version, 2);
  });

  it("forbids strangers from editing or deleting", async () => {
    const e = await api(t.base, "PUT", `/api/quizzes/${id}`, body, bob.cookie);
    assert.equal(e.status, 403);
    const d = await api(t.base, "DELETE", `/api/quizzes/${id}`, undefined, bob.cookie);
    assert.equal(d.status, 403);
  });

  it("exports YAML for the author only", async () => {
    const mine = await api(t.base, "GET", `/api/quizzes/${id}/export`, undefined, alice.cookie);
    assert.equal(mine.status, 200);
    assert.match(mine.headers.get("content-type") ?? "", /yaml/);
    assert.match(mine.json, /name: Unity basics 2/);
    assert.match(mine.json, /author: alice/);
    assert.match(mine.json, /answer: 2/);
    const anon = await api(t.base, "GET", `/api/quizzes/${id}/export`);
    assert.equal(anon.status, 401);
    const other = await api(t.base, "GET", `/api/quizzes/${id}/export`, undefined, bob.cookie);
    assert.equal(other.status, 403);
  });

  it("rejects more than five tags", async () => {
    const r = await api(t.base, "POST", "/api/quizzes", { ...body, tags: ["a", "b", "c", "d", "e", "f"] }, alice.cookie);
    assert.equal(r.status, 400);
    assert.match(r.json.error, /at most 5/);
  });

  it("lets an admin unpublish and delete a published quiz", async () => {
    const u = await api(t.base, "POST", `/api/quizzes/${id}/unpublish`, undefined, admin.cookie);
    assert.equal(u.status, 200);
    const gone = await api(t.base, "GET", `/api/quizzes/${id}`);
    assert.equal(gone.status, 404);
    await api(t.base, "POST", `/api/quizzes/${id}/publish`, undefined, alice.cookie);
    const d = await api(t.base, "DELETE", `/api/quizzes/${id}`, undefined, admin.cookie);
    assert.equal(d.status, 200);
    const after = await api(t.base, "GET", `/api/quizzes/${id}`, undefined, alice.cookie);
    assert.equal(after.status, 404);
  });

  it("does not let an admin delete a draft they cannot see", async () => {
    const r = await api(t.base, "POST", "/api/quizzes", body, alice.cookie);
    const d = await api(t.base, "DELETE", `/api/quizzes/${r.json.id}`, undefined, admin.cookie);
    assert.equal(d.status, 404);
  });

  it("sorts by new and paginates", async () => {
    for (let i = 0; i < 21; i++) {
      const r = await api(t.base, "POST", "/api/quizzes", { ...body, title: `Q${i}` }, alice.cookie);
      await api(t.base, "POST", `/api/quizzes/${r.json.id}/publish`, undefined, alice.cookie);
    }
    const p1 = await api(t.base, "GET", "/api/quizzes?sort=new");
    assert.equal(p1.json.items.length, 20);
    assert.equal(p1.json.hasMore, true);
    assert.equal(p1.json.items[0].title, "Q20");
    const p2 = await api(t.base, "GET", "/api/quizzes?sort=new&page=2");
    assert.equal(p2.json.items.length, 1);
    assert.equal(p2.json.hasMore, false);
  });

  it("falls back to the default sort for unknown or prototype keys", async () => {
    const proto = await api(t.base, "GET", "/api/quizzes?sort=constructor");
    assert.equal(proto.status, 200);
    const unknown = await api(t.base, "GET", "/api/quizzes?sort=sideways");
    assert.equal(unknown.status, 200);
    assert.equal(unknown.json.items.length, 20);
  });
});
