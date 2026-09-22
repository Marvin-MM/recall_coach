import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import { type MemoryKind, type MemoryStatus, memoryEvents } from "../schema";
import type { Queryable, Tx } from "../types";

/** A job the relayer accepted. Metadata only — never the memory text. */
export interface AcceptedJob {
  userId: string;
  coachingSessionId: string | null;
  namespace: string;
  kind: MemoryKind;
  jobId: string;
}

export interface CompletedJob {
  jobId: string;
  blobId: string;
  latencyMs: number;
}

export interface FailedJob {
  jobId: string;
  errorCode: string;
  latencyMs: number | null;
}

export type JobCounts = Record<MemoryStatus, number>;

export interface MemoryEventsRepo {
  /** All rows or none (single transaction). */
  recordAcceptedJobs(jobs: readonly AcceptedJob[]): Promise<void>;
  /**
   * Marks jobs done in one transaction. If a blob id collides with an
   * existing row (should never happen; relayer bug), the batch is retried
   * row-by-row and the colliding rows are marked failed with DUPLICATE_BLOB_ID.
   */
  markJobsDone(jobs: readonly CompletedJob[]): Promise<{ done: number; duplicates: number }>;
  markJobsFailed(jobs: readonly FailedJob[]): Promise<void>;
  markJobFailed(job: FailedJob): Promise<void>;
  /** Re-point a row to a resubmitted job (transient relayer failure retry). */
  replaceJob(oldJobId: string, newJobId: string): Promise<void>;
  countDoneBlobsByUser(userId: string): Promise<number>;
  countJobsForSession(userId: string, coachingSessionId: string): Promise<JobCounts>;
  /** Pending jobs older than `olderThan` (for the cron health log). */
  countStalePending(olderThan: Date): Promise<number>;
  /** Pending jobs to reconcile, oldest first. Scoped to a user (and session) when given. */
  listPending(filter: {
    userId?: string;
    coachingSessionId?: string;
    createdBefore: Date;
    limit: number;
  }): Promise<{ jobId: string; createdAt: Date }[]>;
}

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let i = 0; i < 4 && current; i++) {
    if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

async function applyDone(tx: Tx | Queryable, job: CompletedJob, now: Date): Promise<void> {
  await tx
    .update(memoryEvents)
    .set({
      status: "done",
      blobId: job.blobId,
      latencyMs: job.latencyMs,
      completedAt: now,
      errorCode: null,
    })
    .where(eq(memoryEvents.jobId, job.jobId));
}

async function applyFailed(tx: Tx | Queryable, job: FailedJob, now: Date): Promise<void> {
  await tx
    .update(memoryEvents)
    .set({
      status: "failed",
      errorCode: job.errorCode.slice(0, 64),
      latencyMs: job.latencyMs,
      completedAt: now,
    })
    .where(and(eq(memoryEvents.jobId, job.jobId), sql`${memoryEvents.status} <> 'done'`));
}

export function createMemoryEventsRepo(db: Queryable): MemoryEventsRepo {
  return {
    async recordAcceptedJobs(jobs) {
      if (jobs.length === 0) return;
      await db.transaction(async (tx) => {
        await tx
          .insert(memoryEvents)
          .values(jobs.map((job) => ({ ...job, status: "pending" as const })));
      });
    },

    async markJobsDone(jobs) {
      if (jobs.length === 0) return { done: 0, duplicates: 0 };
      const now = new Date();
      try {
        await db.transaction(async (tx) => {
          for (const job of jobs) await applyDone(tx, job, now);
        });
        return { done: jobs.length, duplicates: 0 };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
      let done = 0;
      let duplicates = 0;
      for (const job of jobs) {
        try {
          await applyDone(db, job, now);
          done++;
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
          duplicates++;
          await applyFailed(
            db,
            { jobId: job.jobId, errorCode: "DUPLICATE_BLOB_ID", latencyMs: job.latencyMs },
            now,
          );
        }
      }
      return { done, duplicates };
    },

    async markJobsFailed(jobs) {
      if (jobs.length === 0) return;
      const now = new Date();
      await db.transaction(async (tx) => {
        for (const job of jobs) await applyFailed(tx, job, now);
      });
    },

    async markJobFailed(job) {
      await applyFailed(db, job, new Date());
    },

    async replaceJob(oldJobId, newJobId) {
      await db
        .update(memoryEvents)
        .set({
          jobId: newJobId,
          status: "pending",
          errorCode: null,
          completedAt: null,
          latencyMs: null,
        })
        .where(and(eq(memoryEvents.jobId, oldJobId), sql`${memoryEvents.status} <> 'done'`));
    },

    async countDoneBlobsByUser(userId) {
      const rows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(memoryEvents)
        .where(and(eq(memoryEvents.userId, userId), eq(memoryEvents.status, "done")));
      return rows[0]?.count ?? 0;
    },

    async countJobsForSession(userId, coachingSessionId) {
      const rows = await db
        .select({ status: memoryEvents.status, count: sql<number>`count(*)::int` })
        .from(memoryEvents)
        .where(
          and(
            eq(memoryEvents.userId, userId),
            eq(memoryEvents.coachingSessionId, coachingSessionId),
          ),
        )
        .groupBy(memoryEvents.status);
      const counts: JobCounts = { pending: 0, done: 0, failed: 0 };
      for (const row of rows) counts[row.status] = row.count;
      return counts;
    },

    async listPending(filter) {
      const conditions = [
        eq(memoryEvents.status, "pending"),
        lt(memoryEvents.createdAt, filter.createdBefore),
      ];
      if (filter.userId) conditions.push(eq(memoryEvents.userId, filter.userId));
      if (filter.coachingSessionId) {
        conditions.push(eq(memoryEvents.coachingSessionId, filter.coachingSessionId));
      }
      return db
        .select({ jobId: memoryEvents.jobId, createdAt: memoryEvents.createdAt })
        .from(memoryEvents)
        .where(and(...conditions))
        .orderBy(asc(memoryEvents.createdAt))
        .limit(filter.limit);
    },

    async countStalePending(olderThan) {
      const rows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(memoryEvents)
        .where(
          and(inArray(memoryEvents.status, ["pending"]), lt(memoryEvents.createdAt, olderThan)),
        );
      return rows[0]?.count ?? 0;
    },
  };
}
