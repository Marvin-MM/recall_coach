import { asc, sql } from "drizzle-orm";
import { coachingSessions, type MemoryKind, memoryEvents, recallEvents, user } from "../schema";
import type { Queryable } from "../types";

export interface UserEvidenceRow {
  /** Internal id — callers must pseudonymize before exposing. */
  userId: string;
  doneByKind: Partial<Record<MemoryKind, number>>;
  doneTotal: number;
  failedTotal: number;
  pendingTotal: number;
  sessions: number;
  recalls: number;
  recallHits: number;
  firstActivity: Date | null;
  lastActivity: Date | null;
}

export interface EvidenceRepo {
  perUser(): Promise<UserEvidenceRow[]>;
}

/**
 * Aggregate, metadata-only statistics for the evidence dashboard and
 * `pnpm memwal:stats`. Users are ordered by account creation so the
 * pseudonyms (user-1, user-2, …) stay stable across runs.
 */
export function createEvidenceRepo(db: Queryable): EvidenceRepo {
  return {
    async perUser() {
      const users = await db
        .select({ id: user.id })
        .from(user)
        .orderBy(asc(user.createdAt), asc(user.id));

      const memRows = await db
        .select({
          userId: memoryEvents.userId,
          kind: memoryEvents.kind,
          status: memoryEvents.status,
          count: sql<number>`count(*)::int`,
          first: sql<Date | null>`min(${memoryEvents.createdAt})`,
          last: sql<Date | null>`max(${memoryEvents.createdAt})`,
        })
        .from(memoryEvents)
        .groupBy(memoryEvents.userId, memoryEvents.kind, memoryEvents.status);

      const sessionRows = await db
        .select({
          userId: coachingSessions.userId,
          count: sql<number>`count(*)::int`,
          first: sql<Date | null>`min(${coachingSessions.createdAt})`,
          last: sql<Date | null>`max(${coachingSessions.updatedAt})`,
        })
        .from(coachingSessions)
        .groupBy(coachingSessions.userId);

      const recallRows = await db
        .select({
          userId: recallEvents.userId,
          count: sql<number>`count(*)::int`,
          hits: sql<number>`count(*) filter (where ${recallEvents.resultCount} > 0 and not ${recallEvents.degraded})::int`,
        })
        .from(recallEvents)
        .groupBy(recallEvents.userId);

      const byUser = new Map<string, UserEvidenceRow>(
        users.map((u) => [
          u.id,
          {
            userId: u.id,
            doneByKind: {},
            doneTotal: 0,
            failedTotal: 0,
            pendingTotal: 0,
            sessions: 0,
            recalls: 0,
            recallHits: 0,
            firstActivity: null,
            lastActivity: null,
          },
        ]),
      );

      const widen = (
        row: UserEvidenceRow,
        first: Date | string | null,
        last: Date | string | null,
      ) => {
        const f = first ? new Date(first) : null;
        const l = last ? new Date(last) : null;
        if (f && (!row.firstActivity || f < row.firstActivity)) row.firstActivity = f;
        if (l && (!row.lastActivity || l > row.lastActivity)) row.lastActivity = l;
      };

      for (const m of memRows) {
        const row = byUser.get(m.userId);
        if (!row) continue;
        if (m.status === "done") {
          row.doneByKind[m.kind] = (row.doneByKind[m.kind] ?? 0) + m.count;
          row.doneTotal += m.count;
        } else if (m.status === "failed") row.failedTotal += m.count;
        else row.pendingTotal += m.count;
        widen(row, m.first, m.last);
      }
      for (const s of sessionRows) {
        const row = byUser.get(s.userId);
        if (!row) continue;
        row.sessions = s.count;
        widen(row, s.first, s.last);
      }
      for (const r of recallRows) {
        const row = byUser.get(r.userId);
        if (!row) continue;
        row.recalls = r.count;
        row.recallHits = r.hits;
      }
      return [...byUser.values()];
    },
  };
}
