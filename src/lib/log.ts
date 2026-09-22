/**
 * Minimal structured JSON logger. One line per event, safe for Vercel logs.
 * Any key matching the redaction pattern is replaced, recursively, so a stray
 * `{ apiKey }` or request headers object can never leak a secret.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const REDACT_KEY = /key|secret|token|authorization|cookie|password|credential/i;
const MAX_DEPTH = 6;
export const REDACTED = "[REDACTED]";

function minLevel(): LogLevel {
  const configured = process.env.LOG_LEVEL;
  if (
    configured === "debug" ||
    configured === "info" ||
    configured === "warn" ||
    configured === "error"
  ) {
    return configured;
  }
  return process.env.NODE_ENV === "test" ? "warn" : "info";
}

function serializeError(error: Error): LogFields {
  const out: LogFields = { name: error.name, message: error.message };
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" || typeof code === "number") out.code = code;
  const status = (error as { status?: unknown }).status;
  if (typeof status === "number") out.status = status;
  return out;
}

export function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[Truncated]";
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (value instanceof Error) return redact(serializeError(value), depth + 1, seen);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1, seen));
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = REDACT_KEY.test(key) ? REDACTED : redact(inner, depth + 1, seen);
  }
  return out;
}

function emit(level: LogLevel, event: string, fields: LogFields = {}): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel()]) return;
  const line = JSON.stringify({
    level,
    event,
    time: new Date().toISOString(),
    ...(redact(fields) as LogFields),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (event: string, fields?: LogFields) => emit("debug", event, fields),
  info: (event: string, fields?: LogFields) => emit("info", event, fields),
  warn: (event: string, fields?: LogFields) => emit("warn", event, fields),
  error: (event: string, fields?: LogFields) => emit("error", event, fields),
};

/** Log `event` at error level at most once per process (e.g. auth misconfig). */
const onceKeys = new Set<string>();
export function logOnce(level: LogLevel, event: string, fields?: LogFields): void {
  if (onceKeys.has(event)) return;
  onceKeys.add(event);
  emit(level, event, fields);
}
