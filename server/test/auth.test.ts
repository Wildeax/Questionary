import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { signSession, verifySession } from "../auth.ts";
import { api, asUser, startServer, type TestServer } from "./helpers.ts";

describe("session tokens", () => {
  it("round-trips a user id", () => {
    const token = signSession(42, "s");
    assert.equal(verifySession(token, "s"), 42);
  });
  it("rejects a tampered signature", () => {
    const token = signSession(42, "s");
    assert.equal(verifySession(token.slice(0, -1) + "x", "s"), null);
  });
  it("rejects a different secret", () => {
    assert.equal(verifySession(signSession(42, "s"), "other"), null);
  });
  it("rejects an expired token", () => {
    const token = signSession(42, "s", Date.now() - 31 * 24 * 60 * 60 * 1000);
    assert.equal(verifySession(token, "s"), null);
  });
  it("rejects garbage", () => {
    assert.equal(verifySession(undefined, "s"), null);
    assert.equal(verifySession("a.b", "s"), null);
  });
});

describe("auth routes", () => {
  let t: TestServer;
  before(async () => {
    t = await startServer();
  });
  after(() => t.close());

  it("GET /api/me is 401 when signed out", async () => {
    const r = await api(t.base, "GET", "/api/me");
    assert.equal(r.status, 401);
    assert.equal(typeof r.json.error, "string");
  });

  it("GET /api/me returns the user and admin flag", async () => {
    const u = asUser(t.db, "admin");
    const r = await api(t.base, "GET", "/api/me", undefined, u.cookie);
    assert.equal(r.status, 200);
    assert.equal(r.json.username, "admin");
    assert.equal(r.json.isAdmin, true);
    assert.equal(r.json.avatarUrl, "https://avatars.example/admin");
  });

  it("POST /api/auth/logout clears the cookie", async () => {
    const u = asUser(t.db, "bob");
    const r = await api(t.base, "POST", "/api/auth/logout", undefined, u.cookie);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("set-cookie") ?? "", /qs=;/);
  });

  it("GET /api/auth/github redirects to GitHub with a state cookie", async () => {
    const r = await api(t.base, "GET", "/api/auth/github");
    assert.equal(r.status, 302);
    assert.match(r.headers.get("location") ?? "", /^https:\/\/github\.com\/login\/oauth\/authorize\?/);
    assert.match(r.headers.get("set-cookie") ?? "", /oauth_state=/);
  });

  it("callback without a matching state redirects to /?error=auth", async () => {
    const r = await api(t.base, "GET", "/api/auth/github/callback?code=x&state=y");
    assert.equal(r.status, 302);
    assert.equal(r.headers.get("location"), "/?error=auth");
  });

  it("rejects mutating requests that are not JSON", async () => {
    const res = await fetch(t.base + "/api/auth/logout", { method: "POST" });
    assert.equal(res.status, 415);
  });

  it("unknown API paths are JSON 404s", async () => {
    const r = await api(t.base, "GET", "/api/nope");
    assert.equal(r.status, 404);
    assert.equal(r.json.error, "Not found");
  });
});
