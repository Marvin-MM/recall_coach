import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import {
  type CoachingMode,
  type CoachingSessionRow,
  coachingSessions,
  memoryEvents,
} from "../schema";
import type { Queryable } from "../types";
import { ensureUserSettings } from "./user-settings.repo";

export interface NewCoachingSession {
  userId: string;
  mode: CoachingMode;
  memoryEnabled: boolean;
  title: string;
}

export interface SessionListItem {
  id: string;
  mode: CoachingMode;
  title: string;
  memoryEnabled: boolean;
  turnCount: number;
  createdAt: Date;
  lastActivityAt: Date;
  endedAt: Date | null;
  savedMemories: number;
}

export interface SessionOwnerKey {
  id: string;
  userId: string;
}

export interface CoachingSessionsRepo {
  /** Ensures user_settings exists and creates the session in ONE transaction. */
  createSession(input: NewCoachingSession): Promise<CoachingSessionRow>;
  /** Returns the session only if it belongs to `userId` (else null → 404). */
  getForUser(key: SessionOwnerKey): Promise<CoachingSessionRow | null>;
  listRecent(userId: string, limit?: number): Promise<SessionListItem[]>;
  incrementTurn(key: SessionOwnerKey): Promise<number | null>;
  endSession(key: SessionOwnerKey, at?: Date): Promise<CoachingSessionRow | null>;
  /** Only allowed before the first turn of an open session; null if not allowed. */
  setMemoryEnabled(key: SessionOwnerKey, enabled: boolean): Promise<CoachingSessionRow | null>;
  countByUser(userId: string): Promise<number>;
  /**
   * Ends open sessions whose last activity is before `idleBefore` (all users
   * when `userId` is omitted — the daily cron). Returns how many were ended.
   */
  endIdleSessions(input: { idleBefore: Date; now: Date; userId?: string }): Promise<number>;
  /** Most recent open session active since `activeSince`, or null. */
  findActive(userId: string, activeSince: Date): Promise<CoachingSessionRow | null>;
}

const owned = (key: SessionOwnerKey) =>
  and(eq(coachingSessions.id, key.id), eq(coachingSessions.userId, key.userId));

export function createCoachingSessionsRepo(db: Queryable): CoachingSessionsRepo {
  return {
    createSession(input) {
      return db.transaction(async (tx) => {
        await ensureUserSettings(tx, input.userId);
        const rows = await tx.insert(coachingSessions).values(input).returning();
        const row = rows[0];
        if (!row) throw new Error("createSession: insert returned no row");
        return row;
      });
    },

    async getForUser(key) {
      const rows = await db.select().from(coachingSessions).where(owned(key)).limit(1);
      return rows[0] ?? null;
    },

    async listRecent(userId, limit = 20) {
      const saved = db
        .select({
          sessionId: memoryEvents.coachingSessionId,
          count: sql<number>`count(*)::int`.as("count"),
        })
        .from(memoryEvents)
        .where(and(eq(memoryEvents.userId, userId), eq(memoryEvents.status, "done")))
        .groupBy(memoryEvents.coachingSessionId)
        .as("saved");

      const rows = await db
        .select({
          id: coachingSessions.id,
          mode: coachingSessions.mode,
          title: coachingSessions.title,
          memoryEnabled: coachingSessions.memoryEnabled,
          turnCount: coachingSessions.turnCount,
          createdAt: coachingSessions.createdAt,
          lastActivityAt: coachingSessions.lastActivityAt,
          endedAt: coachingSessions.endedAt,
          savedMemories: sql<number>`coalesce(${saved.count}, 0)::int`,
        })
        .from(coachingSessions)
        .leftJoin(saved, eq(saved.sessionId, coachingSessions.id))
        .where(eq(coachingSessions.userId, userId))
        .orderBy(desc(coachingSessions.createdAt))
        .limit(limit);
      return rows;
    },

    async incrementTurn(key) {
      // Single UPDATE … SET x = x + 1 is atomic; no read-modify-write race.
      const rows = await db
        .update(coachingSessions)
        .set({ turnCount: sql`${coachingSessions.turnCount} + 1`, updatedAt: new Date() })
        .where(owned(key))
        .returning({ turnCount: coachingSessions.turnCount });
      return rows[0]?.turnCount ?? null;
    },

    async endSession(key, at = new Date()) {
      const rows = await db
        .update(coachingSessions)
        .set({ endedAt: at, updatedAt: at })
        .where(and(owned(key), isNull(coachingSessions.endedAt)))
        .returning();
      if (rows[0]) return rows[0];
      // Already ended: idempotent — return the existing row if it is ours.
      const existing = await db.select().from(coachingSessions).where(owned(key)).limit(1);
      return existing[0] ?? null;
    },

    async setMemoryEnabled(key, enabled) {
      const rows = await db
        .update(coachingSessions)
        .set({ memoryEnabled: enabled, updatedAt: new Date() })
        .where(and(owned(key), eq(coachingSessions.turnCount, 0), isNull(coachingSessions.endedAt)))
        .returning();
      return rows[0] ?? null;
    },

    async endIdleSessions({ idleBefore, now, userId }) {
      const rows = await db
        .update(coachingSessions)
        .set({ endedAt: now, updatedAt: now })
        .where(
          and(
            isNull(coachingSessions.endedAt),
            lt(coachingSessions.lastActivityAt, idleBefore),
            ...(userId ? [eq(coachingSessions.userId, userId)] : []),
          ),
        )
        .returning({ id: coachingSessions.id });
      return rows.length;
    },

    async findActive(userId, activeSince) {
      const rows = await db
        .select()
        .from(coachingSessions)
        .where(
          and(
            eq(coachingSessions.userId, userId),
            isNull(coachingSessions.endedAt),
            gte(coachingSessions.lastActivityAt, activeSince),
          ),
        )
        .orderBy(desc(coachingSessions.lastActivityAt))
        .limit(1);
      return rows[0] ?? null;
    },

    async countByUser(userId) {
      const rows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(coachingSessions)
        .where(eq(coachingSessions.userId, userId));
      return rows[0]?.count ?? 0;
    },
  };
}
