import { OperationTimeoutError } from "./errors";

export interface WithTimeoutOptions {
  /** Aborted when the timeout fires, so the underlying work can stop early. */
  controller?: AbortController;
  /** Build a domain-specific error instead of OperationTimeoutError. */
  makeError?: (label: string, ms: number) => Error;
}

/**
 * Race `promise` against a timer. The timer is always cleared, so a settled
 * promise never leaves a pending handle keeping a serverless function alive.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
  options: WithTimeoutOptions = {},
): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) {
    return Promise.reject(new RangeError(`withTimeout(${label}): ms must be > 0, got ${ms}`));
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      options.controller?.abort();
      reject(options.makeError?.(label, ms) ?? new OperationTimeoutError(label, ms));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
