import { MemoryUnavailableError } from "@/lib/errors";
import type { MemoryPort } from "./memory-port";

export class CircuitOpenError extends MemoryUnavailableError {
  constructor() {
    super("Memory circuit breaker is open; skipping call.");
  }
  override readonly code = "MEMORY_CIRCUIT_OPEN";
}

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  openMs?: number;
  now?: () => number;
}

/**
 * Minimal consecutive-failure breaker: opens after N consecutive failures,
 * short-circuits for `openMs`, then lets ONE trial call through (half-open).
 * A success closes it; a failed trial re-opens it.
 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;
  private trialInFlight = false;
  private readonly threshold: number;
  private readonly openMs: number;
  private readonly now: () => number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.threshold = options.failureThreshold ?? 3;
    this.openMs = options.openMs ?? 30_000;
    this.now = options.now ?? Date.now;
  }

  get state(): CircuitState {
    if (this.openedAt === null) return "closed";
    return this.now() - this.openedAt >= this.openMs ? "half-open" : "open";
  }

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.state;
    if (state === "open") throw new CircuitOpenError();
    if (state === "half-open") {
      if (this.trialInFlight) throw new CircuitOpenError();
      this.trialInFlight = true;
    }
    try {
      const result = await fn();
      this.failures = 0;
      this.openedAt = null;
      return result;
    } catch (error) {
      this.failures++;
      if (state === "half-open" || this.failures >= this.threshold) this.openedAt = this.now();
      throw error;
    } finally {
      if (state === "half-open") this.trialInFlight = false;
    }
  }

  reset(): void {
    this.failures = 0;
    this.openedAt = null;
    this.trialInFlight = false;
  }
}

/** Wrap recall/remember in the breaker; health bypasses it and reports state. */
export function withCircuitBreaker(port: MemoryPort, breaker: CircuitBreaker): MemoryPort {
  return {
    driver: port.driver,
    recall: (args) => breaker.exec(() => port.recall(args)),
    rememberMany: (args) => breaker.exec(() => port.rememberMany(args)),
    jobStatuses: (jobIds) => breaker.exec(() => port.jobStatuses(jobIds)),
    async health() {
      const h = await port.health();
      return breaker.state === "closed"
        ? h
        : { ...h, ok: false, reason: h.reason ?? `circuit ${breaker.state}` };
    },
  };
}
