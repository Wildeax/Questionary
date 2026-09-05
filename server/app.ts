import express from "express";
import type { Db } from "./db.ts";
import { attachUser, type Config } from "./auth.ts";
import { errorHandler, jsonOnly } from "./http.ts";
import { authRoutes } from "./routes/auth.ts";
import { quizRoutes } from "./routes/quizzes.ts";

export function createApp(db: Db, config: Config): express.Express {
  const app = express();
  app.use("/api", jsonOnly, express.json({ limit: "1mb" }), attachUser(db, config));
  app.use("/api", authRoutes(db, config));
  app.use("/api", quizRoutes(db));
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  app.use(errorHandler);
  return app;
}
