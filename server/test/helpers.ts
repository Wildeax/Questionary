import type { AddressInfo } from "node:net";
import { createApp } from "../app.ts";
import { openDb, type Db } from "../db.ts";
import { SESSION_COOKIE, signSession, type Config } from "../auth.ts";
import { RoomStore } from "../rooms.ts";

export const testConfig: Config = {
  sessionSecret: "test",
  githubClientId: "id",
  githubClientSecret: "secret",
  baseUrl: "http://localhost",
  adminUsers: ["admin"],
  production: false,
};

export type TestServer = { db: Db; base: string; close: () => Promise<void> };

export async function startServer(store?: RoomStore): Promise<TestServer> {
  const db = openDb(":memory:");
  const app = createApp(db, testConfig, store);
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    db,
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

let nextGithubId = 1000;

export function asUser(db: Db, username: string): { id: number; cookie: string } {
  const row = db
    .prepare("INSERT INTO users (github_id, username, avatar_url, created_at) VALUES (?, ?, ?, ?) RETURNING id")
    .get(nextGithubId++, username, `https://avatars.example/${username}`, Date.now()) as { id: number };
  return { id: row.id, cookie: `${SESSION_COOKIE}=${signSession(row.id, testConfig.sessionSecret)}` };
}

export async function api(
  base: string,
  method: string,
  path: string,
  body?: unknown,
  cookie?: string
): Promise<{ status: number; json: any; headers: Headers }> {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const text = await res.text();
  let json: any = text;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON, keep the text
  }
  return { status: res.status, json, headers: res.headers };
}

export const sampleQuestions = [
  { id: "Q1", type: "mc", prompt: "Pick B", options: ["A", "B", "C"], answer: 1, explanation: "B it is" },
  { id: "Q2", type: "tf", prompt: "Water is wet", answer: true },
];
