import type { NextFunction, Request, Response } from "express";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Parses a positive integer route param or throws 404. */
export function idParam(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(404, "Not found");
  return n;
}

/** CSRF guard: every mutating API call must declare a JSON body. Cross-site forms cannot. */
export function jsonOnly(req: Request, res: Response, next: NextFunction): void {
  const mutating = req.method === "POST" || req.method === "PUT" || req.method === "DELETE" || req.method === "PATCH";
  const type = req.headers["content-type"] ?? "";
  if (mutating && !type.startsWith("application/json")) {
    res.status(415).json({ error: "Send JSON with Content-Type: application/json" });
    return;
  }
  next();
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const known = err as { status?: unknown; message?: unknown };
  const status = err instanceof HttpError ? err.status : typeof known.status === "number" ? known.status : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? "Something went wrong" : String(known.message ?? "Bad request") });
}
