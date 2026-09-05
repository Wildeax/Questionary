import express from "express";
import type { Request, Response } from "express";
import type { Db } from "../db.ts";
import { cookieOptions, getUser, parseCookies, requireMe, requireUser } from "../auth.ts";
import { HttpError, idParam } from "../http.ts";
import { getQuizRow } from "../cards.ts";
import { RoomStore, newPlayerId, type Room } from "../rooms.ts";
import { stripAnswers } from "../../shared/grade.ts";
import type { Question } from "../../shared/types.ts";

export const PLAYER_COOKIE = "rp";
const PLAYER_COOKIE_MS = 24 * 60 * 60 * 1000;

export function roomRoutes(db: Db, store: RoomStore, production: boolean): express.Router {
  const r = express.Router();

  const playerIdOf = (req: Request): string | undefined => {
    const v = parseCookies(req.headers.cookie)[PLAYER_COOKIE];
    return v && /^[0-9a-f]{32}$/.test(v) ? v : undefined;
  };

  const ensurePlayerId = (req: Request, res: Response): string => {
    let id = playerIdOf(req);
    if (!id) {
      id = newPlayerId();
      res.cookie(PLAYER_COOKIE, id, cookieOptions(production, PLAYER_COOKIE_MS));
    }
    return id;
  };

  const roomOf = (req: Request): Room => {
    const room = store.get(String(req.params.code));
    if (!room) throw new HttpError(404, "Room not found or expired");
    return room;
  };

  const memberOf = (req: Request): { room: Room; pid: string } => {
    const room = roomOf(req);
    const pid = playerIdOf(req);
    if (!pid || !room.players.has(pid)) throw new HttpError(403, "You are not in this room");
    return { room, pid };
  };

  r.post("/rooms", requireUser, (req, res) => {
    const me = requireMe(res);
    const body = (req.body ?? {}) as { quizId?: unknown; mode?: unknown; questionSeconds?: unknown };
    const row = getQuizRow(db, idParam(body.quizId));
    if (!row.published) throw new HttpError(404, "Not found");
    if (body.mode !== "race" && body.mode !== "sync") throw new HttpError(400, "mode must be race or sync");
    const seconds = body.questionSeconds === undefined ? 20 : Number(body.questionSeconds);
    const pid = ensurePlayerId(req, res);
    const room = store.create(
      { playerId: pid, nickname: me.username, userId: me.id },
      { id: row.id, title: row.title, questions: JSON.parse(row.questions) as Question[] },
      body.mode,
      seconds
    );
    res.status(201).json({ code: room.code });
  });

  r.get("/rooms/:code", (req, res) => {
    const room = roomOf(req);
    const pid = playerIdOf(req);
    const you = pid && room.players.has(pid) ? { id: pid, isHost: pid === room.hostPlayerId } : null;
    res.json({ state: room.state, mode: room.mode, you });
  });

  r.post("/rooms/:code/join", (req, res) => {
    const room = roomOf(req);
    const pid = ensurePlayerId(req, res);
    const nickname = String((req.body as { nickname?: unknown } | null)?.nickname ?? "");
    store.join(room, pid, nickname, getUser(res)?.id);
    res.json({ ok: true });
  });

  r.get("/rooms/:code/events", (req, res) => {
    const { room, pid } = memberOf(req);
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const send = () => {
      try {
        res.write(`data: ${JSON.stringify(store.snapshot(room, pid))}\n\n`);
      } catch {
        // client gone; the close handler unsubscribes
      }
    };
    send();
    const unsubscribe = store.subscribe(room, send);
    const heartbeat = setInterval(() => {
      if (store.get(room.code) !== room) {
        res.end();
        return;
      }
      res.write(": keep-alive\n\n");
    }, 25_000);
    req.on("close", () => {
      unsubscribe();
      clearInterval(heartbeat);
    });
  });

  // ponytail: a finished race player receives the answer key and could share it with someone
  // still playing. Accepted for rooms of friends; upgrade: withhold until the room finishes.
  r.get("/rooms/:code/questions", (req, res) => {
    const { room, pid } = memberOf(req);
    if (room.mode !== "race" || room.state === "lobby" || room.state === "countdown") {
      throw new HttpError(409, "Questions are not available yet");
    }
    const me = room.players.get(pid)!;
    res.json(me.finishedAt !== undefined ? room.quiz.questions : stripAnswers(room.quiz.questions));
  });

  r.post("/rooms/:code/start", (req, res) => {
    const { room, pid } = memberOf(req);
    store.start(room, pid);
    res.json({ ok: true });
  });

  r.post("/rooms/:code/answer", (req, res) => {
    const { room, pid } = memberOf(req);
    const body = req.body as { questionId?: unknown; value?: unknown } | null;
    if (typeof body?.questionId !== "string" || (typeof body.value !== "number" && typeof body.value !== "boolean")) {
      throw new HttpError(400, "questionId and value are required");
    }
    res.json(store.answer(room, pid, body.questionId, body.value));
  });

  r.post("/rooms/:code/next", (req, res) => {
    const { room, pid } = memberOf(req);
    store.next(room, pid);
    res.json({ ok: true });
  });

  r.post("/rooms/:code/end", (req, res) => {
    const { room, pid } = memberOf(req);
    store.end(room, pid);
    res.json({ ok: true });
  });

  return r;
}
