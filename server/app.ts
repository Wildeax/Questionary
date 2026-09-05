import express from "express";
import type { Db } from "./db.ts";
import { attachUser, type Config } from "./auth.ts";
import { errorHandler, jsonOnly } from "./http.ts";
import { authRoutes } from "./routes/auth.ts";
import { quizRoutes } from "./routes/quizzes.ts";
import { playRoutes } from "./routes/play.ts";
import { userRoutes } from "./routes/users.ts";
import { tagRoutes } from "./routes/tags.ts";
import { RoomStore } from "./rooms.ts";
import { roomRoutes } from "./routes/rooms.ts";

export function createApp(db: Db, config: Config, store: RoomStore = new RoomStore()): express.Express {
  const app = express();
  // ponytail: no rate limiting in code. Upgrade: limit_req in nginx or Caddy if abuse shows up.
  app.use("/api", jsonOnly, express.json({ limit: "1mb" }), attachUser(db, config));
  app.use("/api", authRoutes(db, config));
  app.use("/api", quizRoutes(db));
  app.use("/api", playRoutes(db));
  app.use("/api", userRoutes(db));
  app.use("/api", tagRoutes(db));
  app.use("/api", roomRoutes(db, store, config.production));
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  app.use(errorHandler);
  return app;
}
