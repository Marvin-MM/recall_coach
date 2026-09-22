import type { AcceptedMemoryJob, RecalledMemory, RememberOutcome } from "@/types/memory";

export interface RecallArgs {
  namespace: string;
  query: string;
  limit: number;
  /** Cosine distance cut-off (0 = identical). Lower is stricter. */
  maxDistance?: number;
  signal?: AbortSignal;
}

export interface RememberManyArgs {
  namespace: string;
  texts: readonly string[];
  /**
   * Called once per accepted batch, AFTER the relayer accepts the jobs and
   * BEFORE waiting for completion — the persist path records `pending`
   * metadata rows here so jobs are tracked even if the wait is cut short.
   */
  onAccepted?: (jobs: readonly AcceptedMemoryJob[]) => Promise<void>;
}

export type MemoryJobState = "pending" | "done" | "failed" | "unknown";

export interface MemoryJobStatus {
  jobId: string;
  state: MemoryJobState;
  blobId?: string;
  error?: string;
}

export interface MemoryHealth {
  ok: boolean;
  version?: string;
  reason?: string;
}

/**
 * Dependency-injection boundary for long-term memory. Implementations:
 * MemWal (production), noop (Amnesia Mode) and fake (tests/E2E).
 */
export interface MemoryPort {
  readonly driver: "memwal" | "noop" | "fake";
  recall(args: RecallArgs): Promise<RecalledMemory[]>;
  /** Stores every text and waits for completion; one outcome per input index. */
  rememberMany(args: RememberManyArgs): Promise<RememberOutcome[]>;
  /** One-shot status lookup for previously accepted jobs (reconciliation). */
  jobStatuses(jobIds: readonly string[]): Promise<MemoryJobStatus[]>;
  health(): Promise<MemoryHealth>;
}
