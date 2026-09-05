import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createApp } from "./app.ts";
import { openDb } from "./db.ts";
import { errorHandler } from "./http.ts";
import { RoomStore } from "./rooms.ts";
import type { Config } from "./auth.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Load .env here instead of with --env-file. Node's watch mode registers the env
// file, and on Windows that means watching its directory, the project root,
// recursively, so every SQLite write under data/ would restart the server.
try {
  process.loadEnvFile(join(root, ".env"));
} catch (err) {
  // A missing .env is fine: the environment itself carries the settings.
  // Anything else (unreadable file, a directory at that path) must surface.
  if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
}

const production = process.env.NODE_ENV === "production";

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    console.error(`Missing environment variable ${name}. See .env.example.`);
    process.exit(1);
  }
  return value;
}

const config: Config = {
  sessionSecret: env("SESSION_SECRET"),
  githubClientId: env("GITHUB_CLIENT_ID"),
  githubClientSecret: env("GITHUB_CLIENT_SECRET"),
  baseUrl: env("BASE_URL", "http://localhost:3000").replace(/\/$/, ""),
  adminUsers: (process.env.ADMIN_USERS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  production,
};

const db = openDb(env("DATABASE_PATH", join(root, "data", "questionary.db")));
const store = new RoomStore();
const app = createApp(db, config, store);

if (production) {
  const dist = join(root, "dist");
  app.use(express.static(dist));
  // Express 5 wildcard syntax. `/{*splat}` also matches `/`. If this version of the
  // router rejects it, use `app.use((req, res) => ...)` with a `req.method === "GET"` check.
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(join(dist, "index.html"));
  });
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({ root, server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
}

// Registered again after the static and Vite handlers so their errors also get the JSON shape.
app.use(errorHandler);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Questionary listening on http://localhost:${port}${production ? "" : " (dev, Vite middleware)"}`);
});

// Rooms idle for two hours are dropped every five minutes.
setInterval(() => store.sweep(2 * 60 * 60 * 1000), 5 * 60 * 1000).unref();
