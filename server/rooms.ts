import { randomBytes } from "node:crypto";
import { HttpError } from "./http.ts";
import { grade } from "../shared/grade.ts";
import type { Answers, Question, RoomMode, RoomPlayerView, RoomSnapshot, RoomState } from "../shared/types.ts";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const MAX_PLAYERS = 50;
export const COUNTDOWN_MS = 3000;

export type Player = {
  id: string;
  nickname: string;
  userId?: number;
  answers: Record<string, { value: number | boolean; at: number }>;
  correct: number;
  points: number;
  lastPoints: number;
  lastCorrectAt?: number;
  finishedAt?: number;
};

export type Room = {
  code: string;
  hostPlayerId: string;
  quiz: { id: number; title: string; questions: Question[] };
  mode: RoomMode;
  state: RoomState;
  players: Map<string, Player>;
  questionSeconds: number;
  currentIndex: number;
  questionStartedAt: number;
  countdownEndsAt: number;
  runningSince: number;
  createdAt: number;
  lastActivity: number;
  listeners: Set<() => void>;
  cancelTimer?: () => void;
};

/** Time source and one-shot scheduler, injectable so tests can drive timers. */
export type Clock = {
  now: () => number;
  schedule: (fn: () => void, ms: number) => () => void;
};

export const realClock: Clock = {
  now: () => Date.now(),
  schedule: (fn, ms) => {
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
  },
};

export type RaceAnswerResult =
  | { finished: false }
  | { finished: true; correct: number; total: number; durationMs: number; questions: Question[] };

export type AnswerResult = { ok: true; finished?: undefined } | RaceAnswerResult;

export function newPlayerId(): string {
  return randomBytes(16).toString("hex");
}

function newPlayer(id: string, nickname: string, userId?: number): Player {
  return { id, nickname, userId, answers: {}, correct: 0, points: 0, lastPoints: 0 };
}

// ponytail: rooms live in this Map in one process. Ceiling: a restart drops live rooms
// and a second process cannot see them. Upgrade: a rooms table plus polling, or Redis pub/sub.
export class RoomStore {
  rooms = new Map<string, Room>();
  clock: Clock;

  constructor(clock: Clock = realClock) {
    this.clock = clock;
  }

  create(host: { playerId: string; nickname: string; userId: number }, quiz: Room["quiz"], mode: RoomMode, questionSeconds = 20): Room {
    if (!Number.isInteger(questionSeconds) || questionSeconds < 5 || questionSeconds > 120) {
      throw new HttpError(400, "questionSeconds must be between 5 and 120");
    }
    const now = this.clock.now();
    const room: Room = {
      code: this.newCode(),
      hostPlayerId: host.playerId,
      quiz,
      mode,
      state: "lobby",
      players: new Map(),
      questionSeconds,
      currentIndex: 0,
      questionStartedAt: 0,
      countdownEndsAt: 0,
      runningSince: 0,
      createdAt: now,
      lastActivity: now,
      listeners: new Set(),
    };
    room.players.set(host.playerId, newPlayer(host.playerId, host.nickname, host.userId));
    this.rooms.set(room.code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  join(room: Room, playerId: string, nickname: string, userId?: number): void {
    if (room.players.has(playerId)) return;
    if (room.state !== "lobby") throw new HttpError(409, "This room has already started");
    if (room.players.size >= MAX_PLAYERS) throw new HttpError(409, "This room is full");
    const name = nickname.trim();
    if (name.length < 1 || name.length > 20) throw new HttpError(400, "Nickname must be 1 to 20 characters");
    for (const p of room.players.values()) {
      if (p.nickname.toLowerCase() === name.toLowerCase()) throw new HttpError(400, "That nickname is taken");
    }
    room.players.set(playerId, newPlayer(playerId, name, userId));
    this.touch(room);
  }

  start(room: Room, playerId: string): void {
    this.requireHost(room, playerId);
    if (room.state !== "lobby") throw new HttpError(409, "Already started");
    if (room.mode === "race") {
      room.state = "countdown";
      room.countdownEndsAt = this.clock.now() + COUNTDOWN_MS;
      room.cancelTimer = this.clock.schedule(() => {
        if (room.state !== "countdown") return;
        room.cancelTimer = undefined;
        room.state = "running";
        room.runningSince = this.clock.now();
        this.touch(room);
      }, COUNTDOWN_MS);
      this.touch(room);
      return;
    }
    this.showQuestion(room, 0);
  }

  answer(room: Room, playerId: string, questionId: string, value: number | boolean): AnswerResult {
    const player = this.requirePlayer(room, playerId);
    const question = room.quiz.questions.find((q) => q.id === questionId);
    if (!question) throw new HttpError(400, "Unknown question");
    if (question.type === "mc" ? typeof value !== "number" : typeof value !== "boolean") {
      throw new HttpError(400, "Wrong answer type");
    }
    if (player.answers[questionId]) throw new HttpError(409, "Already answered");
    const now = this.clock.now();

    if (room.mode === "race") {
      if (room.state !== "running") throw new HttpError(409, "The race is not running");
      player.answers[questionId] = { value, at: now };
      player.correct = this.correctCount(room, player);
      let result: RaceAnswerResult = { finished: false };
      if (Object.keys(player.answers).length === room.quiz.questions.length) {
        player.finishedAt = now;
        result = {
          finished: true,
          correct: player.correct,
          total: room.quiz.questions.length,
          durationMs: now - room.runningSince,
          questions: room.quiz.questions,
        };
        if ([...room.players.values()].every((p) => p.finishedAt !== undefined)) room.state = "finished";
      }
      this.touch(room);
      return result;
    }

    if (room.state !== "question") throw new HttpError(409, "No question is open");
    const current = room.quiz.questions[room.currentIndex];
    if (current.id !== questionId) throw new HttpError(409, "That question is not open");
    player.answers[questionId] = { value, at: now };
    const correct = grade([question], { [questionId]: value }).correct === 1;
    const limitMs = room.questionSeconds * 1000;
    const points = correct ? Math.max(500, Math.round(1000 - (500 * (now - room.questionStartedAt)) / limitMs)) : 0;
    player.points += points;
    player.lastPoints = points;
    if (correct) {
      player.correct += 1;
      player.lastCorrectAt = now;
    }
    if ([...room.players.values()].every((p) => p.answers[questionId])) this.reveal(room);
    else this.touch(room);
    return { ok: true };
  }

  next(room: Room, playerId: string): void {
    this.requireHost(room, playerId);
    if (room.mode !== "sync" || room.state !== "reveal") throw new HttpError(409, "Nothing to advance");
    if (room.currentIndex + 1 < room.quiz.questions.length) {
      this.showQuestion(room, room.currentIndex + 1);
      return;
    }
    room.state = "finished";
    this.touch(room);
  }

  end(room: Room, playerId: string): void {
    this.requireHost(room, playerId);
    if (room.mode !== "race" || room.state !== "running") throw new HttpError(409, "Nothing to end");
    const now = this.clock.now();
    for (const p of room.players.values()) if (p.finishedAt === undefined) p.finishedAt = now;
    room.state = "finished";
    this.touch(room);
  }

  subscribe(room: Room, fn: () => void): () => void {
    room.listeners.add(fn);
    return () => room.listeners.delete(fn);
  }

  snapshot(room: Room, playerId: string | null): RoomSnapshot {
    const me = playerId ? room.players.get(playerId) : undefined;
    const snap: RoomSnapshot = {
      code: room.code,
      mode: room.mode,
      state: room.state,
      questionSeconds: room.questionSeconds,
      quiz: { id: room.quiz.id, title: room.quiz.title, questionCount: room.quiz.questions.length },
      host: room.players.get(room.hostPlayerId)?.nickname ?? "",
      you: me
        ? {
            id: me.id,
            isHost: me.id === room.hostPlayerId,
            answered: Object.keys(me.answers),
            answers: Object.fromEntries(Object.entries(me.answers).map(([id, a]) => [id, a.value])),
          }
        : null,
      players: [...room.players.values()].map((p) => this.view(room, p)),
    };
    if (room.state === "countdown") snap.countdownEndsAt = room.countdownEndsAt;
    if (room.mode === "sync" && (room.state === "question" || room.state === "reveal")) {
      const q = room.quiz.questions[room.currentIndex];
      snap.question = {
        index: room.currentIndex,
        id: q.id,
        prompt: q.prompt,
        type: q.type,
        options: q.type === "mc" ? q.options : undefined,
        endsAt: room.questionStartedAt + room.questionSeconds * 1000,
      };
      if (room.state === "reveal") {
        snap.reveal = { questionId: q.id, answer: q.answer, explanation: q.explanation, scoreboard: this.ranking(room) };
      }
    }
    if (room.state === "finished") snap.ranking = this.ranking(room);
    return snap;
  }

  /** Deletes rooms idle longer than maxIdleMs and cancels their timers. Returns how many. */
  sweep(maxIdleMs: number): number {
    const cutoff = this.clock.now() - maxIdleMs;
    let removed = 0;
    for (const [code, room] of this.rooms) {
      if (room.lastActivity < cutoff) {
        room.cancelTimer?.();
        room.listeners.clear();
        this.rooms.delete(code);
        removed++;
      }
    }
    return removed;
  }

  private view(room: Room, p: Player): RoomPlayerView {
    const base: RoomPlayerView = { id: p.id, nickname: p.nickname, answered: Object.keys(p.answers).length, finished: p.finishedAt !== undefined };
    if (room.mode === "race") {
      if (p.finishedAt !== undefined) {
        base.correct = p.correct;
        base.durationMs = p.finishedAt - room.runningSince;
      }
      return base;
    }
    base.points = p.points;
    base.lastPoints = p.lastPoints;
    base.answeredCurrent =
      (room.state === "question" || room.state === "reveal") && Boolean(p.answers[room.quiz.questions[room.currentIndex].id]);
    return base;
  }

  private ranking(room: Room): RoomPlayerView[] {
    const players = [...room.players.values()];
    if (room.mode === "race") {
      players.sort((a, b) => b.correct - a.correct || (a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity));
    } else {
      players.sort((a, b) => b.points - a.points || (a.lastCorrectAt ?? Infinity) - (b.lastCorrectAt ?? Infinity));
    }
    return players.map((p) => this.view(room, p));
  }

  private showQuestion(room: Room, index: number): void {
    room.cancelTimer?.();
    room.state = "question";
    room.currentIndex = index;
    room.questionStartedAt = this.clock.now();
    for (const p of room.players.values()) p.lastPoints = 0;
    room.cancelTimer = this.clock.schedule(() => this.reveal(room), room.questionSeconds * 1000);
    this.touch(room);
  }

  private reveal(room: Room): void {
    if (room.state !== "question") return;
    room.cancelTimer?.();
    room.cancelTimer = undefined;
    room.state = "reveal";
    this.touch(room);
  }

  private correctCount(room: Room, player: Player): number {
    const answers: Answers = {};
    for (const [id, a] of Object.entries(player.answers)) answers[id] = a.value;
    return grade(room.quiz.questions, answers).correct;
  }

  private touch(room: Room): void {
    room.lastActivity = this.clock.now();
    for (const fn of room.listeners) fn();
  }

  // ponytail: no host transfer. A host who leaves strands a sync room at reveal.
  // Upgrade: an auto-advance timer on reveal.
  private requireHost(room: Room, playerId: string): void {
    if (room.hostPlayerId !== playerId) throw new HttpError(403, "Only the host can do that");
  }

  private requirePlayer(room: Room, playerId: string): Player {
    const p = room.players.get(playerId);
    if (!p) throw new HttpError(403, "You are not in this room");
    return p;
  }

  private newCode(): string {
    for (;;) {
      const bytes = randomBytes(6);
      let code = "";
      for (let i = 0; i < 6; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
      if (!this.rooms.has(code)) return code;
    }
  }
}
