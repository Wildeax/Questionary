import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { Db } from "./db.ts";
import { HttpError } from "./http.ts";
import type { Me } from "../shared/types.ts";

export type Config = {
  sessionSecret: string;
  githubClientId: string;
  githubClientSecret: string;
  baseUrl: string;
  adminUsers: string[];
  production: boolean;
};

export const SESSION_COOKIE = "qs";
export const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    const raw = part.slice(i + 1).trim();
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(raw);
    } catch {
      out[part.slice(0, i).trim()] = raw;
    }
  }
  return out;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

// ponytail: stateless HMAC cookie, no sessions table. Ceiling: no logout-everywhere and
// no revocation before expiry. Upgrade: a sessions table keyed by a random id.
export function signSession(userId: number, secret: string, now = Date.now()): string {
  const payload = `${userId}.${now + SESSION_MS}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySession(token: string | undefined, secret: string, now = Date.now()): number | null {
  if (!token) return null;
  const [id, exp, sig] = token.split(".");
  if (!id || !exp || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(`${id}.${exp}`, secret));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(exp) < now) return null;
  const userId = Number(id);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

export function cookieOptions(production: boolean, maxAgeMs: number) {
  return { httpOnly: true, sameSite: "lax" as const, secure: production, path: "/", maxAge: maxAgeMs };
}

type UserRow = { id: number; username: string; avatar_url: string };

export function attachUser(db: Db, config: Config) {
  const byId = db.prepare("SELECT id, username, avatar_url FROM users WHERE id = ?");
  return (req: Request, res: Response, next: NextFunction): void => {
    const userId = verifySession(parseCookies(req.headers.cookie)[SESSION_COOKIE], config.sessionSecret);
    const row = userId ? (byId.get(userId) as UserRow | undefined) : undefined;
    const me: Me | null = row
      ? { id: row.id, username: row.username, avatarUrl: row.avatar_url, isAdmin: config.adminUsers.includes(row.username) }
      : null;
    res.locals.user = me;
    next();
  };
}

export function getUser(res: Response): Me | null {
  return (res.locals.user as Me | null | undefined) ?? null;
}

export function requireUser(_req: Request, res: Response, next: NextFunction): void {
  if (!getUser(res)) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  next();
}

export function requireMe(res: Response): Me {
  const me = getUser(res);
  if (!me) throw new HttpError(401, "Sign in required");
  return me;
}
