import express from "express";
import { randomBytes } from "node:crypto";
import type { Db } from "../db.ts";
import { SESSION_COOKIE, SESSION_MS, cookieOptions, getUser, parseCookies, signSession, type Config } from "../auth.ts";

export function authRoutes(db: Db, config: Config): express.Router {
  const r = express.Router();
  const upsert = db.prepare(
    `INSERT INTO users (github_id, username, avatar_url, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(github_id) DO UPDATE SET username = excluded.username, avatar_url = excluded.avatar_url
     RETURNING id`
  );
  const callbackUrl = `${config.baseUrl}/api/auth/github/callback`;

  r.get("/auth/github", (_req, res) => {
    const state = randomBytes(16).toString("hex");
    res.cookie("oauth_state", state, cookieOptions(config.production, 10 * 60 * 1000));
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", config.githubClientId);
    url.searchParams.set("redirect_uri", callbackUrl);
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  r.get("/auth/github/callback", async (req, res) => {
    const { code, state } = req.query;
    const expected = parseCookies(req.headers.cookie).oauth_state;
    res.clearCookie("oauth_state", { path: "/" });
    if (typeof code !== "string" || typeof state !== "string" || !expected || state !== expected) {
      res.redirect("/?error=auth");
      return;
    }
    try {
      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: config.githubClientId,
          client_secret: config.githubClientSecret,
          code,
          redirect_uri: callbackUrl,
        }),
      });
      const token = (await tokenRes.json()) as { access_token?: string };
      if (!token.access_token) throw new Error("GitHub returned no access token");
      const userRes = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${token.access_token}`, "User-Agent": "questionary" },
      });
      const gh = (await userRes.json()) as { id?: number; login?: string; avatar_url?: string };
      if (!gh.id || !gh.login) throw new Error("GitHub returned no user");
      const row = upsert.get(gh.id, gh.login, gh.avatar_url ?? "", Date.now()) as { id: number };
      res.cookie(SESSION_COOKIE, signSession(row.id, config.sessionSecret), cookieOptions(config.production, SESSION_MS));
      res.redirect("/");
    } catch (err) {
      console.warn("GitHub sign-in failed:", err);
      res.redirect("/?error=auth");
    }
  });

  r.post("/auth/logout", (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.json({ ok: true });
  });

  r.get("/me", (_req, res) => {
    const me = getUser(res);
    if (!me) {
      res.status(401).json({ error: "Not signed in" });
      return;
    }
    res.json(me);
  });

  return r;
}
