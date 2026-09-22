import "server-only";
import type { z } from "zod";
import {
  AppError,
  type ErrorIssue,
  isAppError,
  RateLimitedError,
  ValidationError,
} from "@/lib/errors";
import { log } from "@/lib/log";
import { isDbUnavailable, toServiceUnavailable } from "@/server/db/client";

export interface ErrorBody {
  error: { code: string; message: string; issues?: readonly ErrorIssue[] };
}

const NO_STORE = { "Cache-Control": "no-store" } as const;
/** Hard cap on raw JSON bodies before parsing (defence against huge payloads). */
export const MAX_JSON_BYTES = 256 * 1024;

export function jsonOk<T>(data: T, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", NO_STORE["Cache-Control"]);
  return Response.json(data, { ...init, headers });
}

export function zodIssues(error: z.ZodError): ErrorIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map((p) => (typeof p === "symbol" ? p.toString() : String(p))).join("."),
    message: issue.message,
  }));
}

/** Map any thrown value to a typed JSON error. Never leaks stacks or secrets. */
export function errorResponse(error: unknown, context: Record<string, unknown> = {}): Response {
  let appError: AppError;
  if (isAppError(error)) appError = error;
  else if (isDbUnavailable(error)) appError = toServiceUnavailable(error);
  else appError = new AppError("INTERNAL", 500, "Internal error", { cause: error, expose: false });

  if (appError.httpStatus >= 500) {
    log.error("http.error", { ...context, code: appError.code, error: appError.cause ?? appError });
  }

  const body: ErrorBody = {
    error: {
      code: appError.code,
      message: appError.expose ? appError.message : "Something went wrong. Please try again.",
      ...(appError instanceof ValidationError ? { issues: appError.issues } : {}),
    },
  };
  const headers: Record<string, string> = { ...NO_STORE };
  if (appError instanceof RateLimitedError)
    headers["Retry-After"] = String(appError.retryAfterSeconds);
  return Response.json(body, { status: appError.httpStatus, headers });
}

/** Read + size-check + Zod-validate a JSON body. Throws ValidationError (400). */
export async function parseJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<z.output<S>> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_JSON_BYTES) {
    throw new ValidationError(
      [{ path: "", message: `Body exceeds ${MAX_JSON_BYTES} bytes` }],
      "Payload too large.",
    );
  }
  const raw = await request.text();
  if (raw.length > MAX_JSON_BYTES) {
    throw new ValidationError(
      [{ path: "", message: `Body exceeds ${MAX_JSON_BYTES} bytes` }],
      "Payload too large.",
    );
  }
  let data: unknown;
  try {
    data = raw.length === 0 ? {} : JSON.parse(raw);
  } catch {
    throw new ValidationError([{ path: "", message: "Body must be valid JSON" }]);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new ValidationError(zodIssues(parsed.error));
  return parsed.data;
}

export function parseWith<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ValidationError(zodIssues(parsed.error));
  return parsed.data;
}
