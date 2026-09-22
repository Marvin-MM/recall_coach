import { log } from "@/lib/log";
import type { MemoryEventsRepo } from "../db/repositories/memory-events.repo";
import { classifyMemoryError } from "./errors";
import type { MemoryPort } from "./memory-port";

export interface ReconcileArgs {
  memory: MemoryPort;
  memoryEvents: MemoryEventsRepo;
  userId?: string;
  coachingSessionId?: string;
  /** Only look at jobs at least this old (default 3 s). */
  minAgeMs?: number;
  /** Jobs the relayer no longer knows after this long are marked failed. */
  giveUpAfterMs?: number;
  limit?: number;
  now?: () => number;
}

export interface ReconcileResult {
  checked: number;
  done: number;
  failed: number;
}

/**
 * Complete `pending` memory_events rows by asking the relayer for their job
 * status. Used by session-summary polling and the daily cron. Never throws.
 */
export async function reconcilePendingJobs(args: ReconcileArgs): Promise<ReconcileResult> {
  const now = args.now ?? Date.now;
  const result: ReconcileResult = { checked: 0, done: 0, failed: 0 };
  if (args.memory.driver === "noop") return result;
  try {
    const pending = await args.memoryEvents.listPending({
      ...(args.userId ? { userId: args.userId } : {}),
      ...(args.coachingSessionId ? { coachingSessionId: args.coachingSessionId } : {}),
      createdBefore: new Date(now() - (args.minAgeMs ?? 3000)),
      limit: args.limit ?? 40,
    });
    if (pending.length === 0) return result;
    result.checked = pending.length;
    const statuses = await args.memory.jobStatuses(pending.map((p) => p.jobId));
    const createdAt = new Map(pending.map((p) => [p.jobId, p.createdAt.getTime()]));
    const giveUpAfter = args.giveUpAfterMs ?? 30 * 60_000;

    const done = statuses.flatMap((s) =>
      s.state === "done" && s.blobId
        ? [
            {
              jobId: s.jobId,
              blobId: s.blobId,
              latencyMs: now() - (createdAt.get(s.jobId) ?? now()),
            },
          ]
        : [],
    );
    const failed = statuses.flatMap((s) => {
      if (s.state === "failed")
        return [{ jobId: s.jobId, errorCode: "JOB_FAILED", latencyMs: null }];
      const age = now() - (createdAt.get(s.jobId) ?? now());
      if (s.state === "unknown" && age > giveUpAfter) {
        return [{ jobId: s.jobId, errorCode: "JOB_NOT_FOUND", latencyMs: null }];
      }
      return [];
    });
    const marked = await args.memoryEvents.markJobsDone(done);
    await args.memoryEvents.markJobsFailed(failed);
    result.done = marked.done;
    result.failed = failed.length + marked.duplicates;
    return result;
  } catch (error) {
    log.warn("memory.reconcile_failed", { code: classifyMemoryError(error).error.code });
    return result;
  }
}
