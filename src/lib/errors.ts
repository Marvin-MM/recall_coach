/**
 * Typed application errors. Every error that can reach an HTTP boundary is an
 * AppError with a stable `code`, an HTTP status and an `expose` flag that says
 * whether `message` is safe to show to the client. Non-exposed errors are
 * reported to clients with a generic message only.
 */
export interface ErrorIssue {
  path: string;
  message: string;
}

export interface AppErrorOptions {
  cause?: unknown;
  expose?: boolean;
}

export class AppError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly expose: boolean;

  constructor(code: string, httpStatus: number, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = httpStatus;
    this.expose = options.expose ?? httpStatus < 500;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Sign in required.") {
    super("UNAUTHORIZED", 401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this resource.") {
    super("FORBIDDEN", 403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found.") {
    super("NOT_FOUND", 404, message);
  }
}

/**
 * 409s carry a stable code the client can act on:
 * SESSION_ENDED (read-only now), SESSION_IDLE (auto-ended after 2 h),
 * STALE_THREAD (refetch the transcript), HISTORY_SETTING_CHANGED (refetch settings).
 */
export class ConflictError extends AppError {
  constructor(message: string, code = "CONFLICT") {
    super(code, 409, message);
  }
}

export class ValidationError extends AppError {
  readonly issues: readonly ErrorIssue[];

  constructor(issues: readonly ErrorIssue[], message = "Invalid request.") {
    super("VALIDATION_FAILED", 400, message);
    this.issues = issues;
  }
}

export class RateLimitedError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, message = "Too many requests. Please slow down.") {
    super("RATE_LIMITED", 429, message);
    this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds));
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = "Service temporarily unavailable. Please retry shortly.", cause?: unknown) {
    super("SERVICE_UNAVAILABLE", 503, message, { cause, expose: true });
  }
}

export class OperationTimeoutError extends AppError {
  readonly label: string;
  readonly timeoutMs: number;

  constructor(label: string, timeoutMs: number) {
    super("TIMEOUT", 504, `${label} timed out after ${timeoutMs}ms`, { expose: false });
    this.label = label;
    this.timeoutMs = timeoutMs;
  }
}

/** Base for all memory-layer failures; always degradable, never fatal to chat. */
export abstract class MemoryError extends AppError {}

export class MemoryUnavailableError extends MemoryError {
  constructor(message = "Memory service unavailable.", cause?: unknown) {
    super("MEMORY_UNAVAILABLE", 503, message, { cause, expose: false });
  }
}

/**
 * Recall answered, but every match was dropped (blob download / SEAL decrypt
 * failed on the relayer). Transient in practice: one retry usually succeeds.
 */
export class MemoryRecallDroppedError extends MemoryError {
  readonly dropped: number;
  constructor(dropped: number) {
    super(
      "MEMORY_RECALL_DROPPED",
      503,
      `recall dropped all ${dropped} matches (blob download/decrypt failed)`,
      { expose: false },
    );
    this.dropped = dropped;
  }
}

/** Delegate key not registered on the account, or account id mismatch. */
export class MemoryAuthError extends MemoryError {
  constructor(message = "Memory service rejected our credentials.", cause?: unknown) {
    super("MEMORY_AUTH", 503, message, { cause, expose: false });
  }
}

export class MemoryTimeoutError extends MemoryError {
  constructor(label: string, timeoutMs: number, cause?: unknown) {
    super("MEMORY_TIMEOUT", 504, `${label} timed out after ${timeoutMs}ms`, {
      cause,
      expose: false,
    });
  }
}

/** SDK/relayer API version mismatch. */
export class MemoryCompatibilityError extends MemoryError {
  constructor(message = "Memory SDK and relayer are incompatible.", cause?: unknown) {
    super("MEMORY_COMPATIBILITY", 503, message, { cause, expose: false });
  }
}

export class InvalidNamespaceError extends AppError {
  constructor(message = "Invalid namespace input.") {
    super("INVALID_NAMESPACE", 500, message, { expose: false });
  }
}

export class LlmError extends AppError {
  readonly retryable: boolean;

  constructor(code: string, message: string, options: { retryable: boolean; cause?: unknown }) {
    super(code, 502, message, { cause: options.cause, expose: false });
    this.retryable = options.retryable;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Stable short code for logs/metrics from any thrown value. */
export function errorCode(error: unknown): string {
  if (error instanceof AppError) return error.code;
  if (error instanceof Error && error.name) return error.name;
  return "UNKNOWN";
}
