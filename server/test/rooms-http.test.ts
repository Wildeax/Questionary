import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { api, asUser, sampleQuestions, startServer, type TestServer } from "./helpers.ts";
import { RoomStore } from "../rooms.ts";

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
    const full = await api(t.base, "GET", `/api/rooms/${code}/questions`, undefined, hostRp);
    assert.equal(full.json[0].answer, 1);
    const done = await api(t.base, "GET", `/api/rooms/${code}`, undefined, hostRp);
    assert.equal(done.json.state, "finished");
  });

  it("pushes a new snapshot on change and drops the listener on disconnect", async () => {
    const store = new RoomStore();
    const s = await startServer(store);
    try {
      const owner = asUser(s.db, "owner");
      const q = await api(s.base, "POST", "/api/quizzes", { title: "Push", questions: sampleQuestions }, owner.cookie);
      await api(s.base, "POST", `/api/quizzes/${q.json.id}/publish`, undefined, owner.cookie);
      const created = await api(s.base, "POST", "/api/rooms", { quizId: q.json.id, mode: "race" }, owner.cookie);
      const code: string = created.json.code;
      const hostRp = playerCookie(created.headers);
      const res = await fetch(s.base + `/api/rooms/${code}/events`, { headers: { Cookie: hostRp } });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      const first = decoder.decode((await reader.read()).value);
      assert.match(first, /"players":\[\{[^\]]*"owner"/);
      assert.equal(store.get(code)!.listeners.size, 1);
      await api(s.base, "POST", `/api/rooms/${code}/join`, { nickname: "friend" });
      const second = decoder.decode((await reader.read()).value);
      assert.match(second, /"friend"/);
      await reader.cancel();
      for (let i = 0; i < 50 && store.get(code)!.listeners.size > 0; i++) await new Promise((r) => setTimeout(r, 20));
      assert.equal(store.get(code)!.listeners.size, 0);
    } finally {
      await s.close();
    }
  });

  it("404s unknown codes", async () => {
    const r = await api(t.base, "GET", "/api/rooms/ZZZZZZ");
    assert.equal(r.status, 404);
  });
});
