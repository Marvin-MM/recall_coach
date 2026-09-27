import { recallEvents } from "../schema";
import type { Queryable } from "../types";

/** Metrics for one recall. Blob ids + numbers only — never memory text. */
export interface RecallEventInput {
  userId: string;
  coachingSessionId: string | null;
  recalledBlobIds: readonly string[];
  resultCount: number;
  bestDistance: number | null;
  latencyMs: number;
  degraded: boolean;
  degradedReason: string | null;
  /** 1, or 2 when the recall was retried once. */
  attempt?: 1 | 2;
}

export interface RecallEventsRepo {
  record(event: RecallEventInput): Promise<void>;
}

export function createRecallEventsRepo(db: Queryable): RecallEventsRepo {
  return {
    async record(event) {
      await db.insert(recallEvents).values({
        ...event,
        recalledBlobIds: [...event.recalledBlobIds],
        latencyMs: Math.max(0, Math.round(event.latencyMs)),
        degradedReason: event.degradedReason?.slice(0, 64) ?? null,
      });
    },
  };
}
