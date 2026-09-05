import type { Answers, Me, PlayQuestion, Question, QuizCard } from "../shared/types.ts";
import type { QuizInput } from "../shared/validate.ts";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && method !== "GET") {
    window.location.href = "/api/auth/github";
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, data.error ?? res.statusText);
  }
  return (await res.json()) as T;
}

export type QuizPage = { items: QuizCard[]; page: number; hasMore: boolean };
export type QuizDetail = QuizCard & { questions?: Question[]; published?: boolean; version?: number };
export type PlayStart = {
  attemptId?: number;
  version: number;
  title: string;
  author: { username: string; avatarUrl: string };
  questions: PlayQuestion[];
};
export type GradeResponse = { correct: number; total: number; durationMs: number | null; questions: Question[] };
export type Profile = { username: string; avatarUrl: string; createdAt: number; quizzes: QuizCard[] };
export type MyQuizzes = { drafts: QuizCard[]; published: QuizCard[] };

export const getMe = () => request<Me>("GET", "/api/me");
export const logout = () => request<{ ok: true }>("POST", "/api/auth/logout");

export function listQuizzes(params: { q?: string; tag?: string; sort?: string; page?: number }) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.tag) search.set("tag", params.tag);
  if (params.sort) search.set("sort", params.sort);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const qs = search.toString();
  return request<QuizPage>("GET", `/api/quizzes${qs ? `?${qs}` : ""}`);
}

export const getQuiz = (id: number | string) => request<QuizDetail>("GET", `/api/quizzes/${id}`);
export const createQuiz = (input: QuizInput) => request<{ id: number }>("POST", "/api/quizzes", input);
export const updateQuiz = (id: number | string, input: QuizInput) =>
  request<{ id: number; version: number }>("PUT", `/api/quizzes/${id}`, input);
export const deleteQuiz = (id: number | string) => request<{ ok: true }>("DELETE", `/api/quizzes/${id}`);
export const publishQuiz = (id: number | string) => request<{ ok: true }>("POST", `/api/quizzes/${id}/publish`);
export const unpublishQuiz = (id: number | string) => request<{ ok: true }>("POST", `/api/quizzes/${id}/unpublish`);

export const getPlay = (id: number | string) => request<PlayStart>("GET", `/api/quizzes/${id}/play`);
export const startAttempt = (id: number | string) => request<PlayStart>("POST", `/api/quizzes/${id}/attempts`);
export const submitAttempt = (attemptId: number, answers: Answers) =>
  request<GradeResponse>("POST", `/api/attempts/${attemptId}`, { answers });
export const gradeAnonymous = (id: number | string, answers: Answers) =>
  request<GradeResponse>("POST", `/api/quizzes/${id}/grade`, { answers });

export const getProfile = (username: string) => request<Profile>("GET", `/api/users/${encodeURIComponent(username)}`);
export const getMyQuizzes = () => request<MyQuizzes>("GET", "/api/me/quizzes");
