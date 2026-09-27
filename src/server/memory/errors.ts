import {
  MemoryAuthError,
  MemoryCompatibilityError,
  MemoryError,
  MemoryTimeoutError,
  MemoryUnavailableError,
} from "@/lib/errors";

interface SdkErrorShape {
  name?: unknown;
  message?: unknown;
  status?: unknown;
  serverCode?: unknown;
}

export interface ClassifiedMemoryError {
  error: MemoryError;
  /** Worth retrying (network, 429, 5xx, timeouts). */
  transient: boolean;
}

/**
 * Map raw MemWal SDK errors (plain Error + `status`/`serverCode`, or
 * MemWalCompatibilityError) into our typed hierarchy.
 */
export function classifyMemoryError(raw: unknown, label = "memory"): ClassifiedMemoryError {
  if (raw instanceof MemoryError) {
    return {
      error: raw,
      transient:
        raw instanceof MemoryTimeoutError ||
        raw.code === "MEMORY_UNAVAILABLE" ||
        raw.code === "MEMORY_RECALL_DROPPED",
    };
  }
  const e = (raw ?? {}) as SdkErrorShape;
  const name = typeof e.name === "string" ? e.name : "";
  const message = typeof e.message === "string" ? e.message : String(raw);
  const status = typeof e.status === "number" ? e.status : undefined;
  const serverCode = typeof e.serverCode === "string" ? e.serverCode : undefined;

  if (name === "MemWalCompatibilityError") {
    return { error: new MemoryCompatibilityError(message, raw), transient: false };
  }
  if (status === 401 || status === 403 || serverCode === "ERR_TIMESTAMP_OUT_OF_BOUNDS") {
    return { error: new MemoryAuthError(message, raw), transient: false };
  }
  if (status === 504 || name === "MemWalRequestTimeout" || /timed out/i.test(message)) {
    return { error: new MemoryTimeoutError(label, 0, raw), transient: true };
  }
  if (status === undefined || status === 0 || status === 429 || status >= 500) {
    return { error: new MemoryUnavailableError(message, raw), transient: true };
  }
  // 4xx other than auth: our request was rejected; retrying will not help.
  return { error: new MemoryUnavailableError(message, raw), transient: false };
}

/** Short stable code for DB `error_code` / logs. */
export function memoryErrorCode(raw: unknown): string {
  return classifyMemoryError(raw).error.code;
}
