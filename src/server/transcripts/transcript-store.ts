import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { coachLimits } from "@/config/coach";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { log } from "@/lib/log";
import { type CoachingSessionRow, coachingSessions, sessionMessages } from "@/server/db/schema";
import type { Queryable } from "@/server/db/types";
import {
  decryptMessage,
  encryptMessage,
  TranscriptDecryptError,
  type TranscriptKeyring,
} from "./crypto";

/** Sessions idle for longer than this are ended (lazily, and by the daily cron). */
export const SESSION_IDLE_MS = coachLimits.sessionIdleMs;

export const FAILED_REPLY_TEXT = "[response failed]";

export type TranscriptRole = "user" | "assistant";
export type TranscriptStatus = "ok" | "failed" | "unreadable";

export interface TranscriptMessage {
  seq: number;
  role: TranscriptRole;
  /** Empty when `status` is "unreadable" (key lost or row tampered with). */
  text: string;
  status: TranscriptStatus;
  createdAt: Date;
}

export interface BeginTurnInput {
  userId: string;
  sessionId: string;
  /** The user's message text (already validated). */
  text: string;
  /** Next seq the client expects; null when history is off (nothing is written). */
  expectedSeq: number | null;
  now: Date;
}

export interface BeginTurnResult {
  session: CoachingSessionRow;
  /** Seq of the stored user message; null when history is off. */
  userSeq: number | null;
  /** Seq the client must send on its next turn; null when history is off. */
  nextSeq: number | null;
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

export const staleThread = () =>
  new ConflictError(
    "This conversation changed in another tab or device. Reloading it.",
    "STALE_THREAD",
  );

async function nextSeqOf(db: Queryable, sessionId: string): Promise<number> {
  const rows = await db
    .select({ max: sql<number | null>`max(${sessionMessages.seq})` })
    .from(sessionMessages)
    .where(eq(sessionMessages.coachingSessionId, sessionId));
  const max = rows[0]?.max;
  return max === null || max === undefined ? 0 : Number(max) + 1;
}

/**
 * Encrypted transcript storage for the user's own viewing. The coach never
 * reads through this module; its only reader is `thread-history.ts`.
 */
export function createTranscriptStore(db: Queryable, keyring: TranscriptKeyring) {
  function decryptRow(row: typeof sessionMessages.$inferSelect, userId: string): TranscriptMessage {
    const base = { seq: row.seq, role: row.role, createdAt: row.createdAt };
    try {
      const text = decryptMessage(
        keyring,
        { userId, sessionId: row.coachingSessionId, seq: row.seq },
        {
          ciphertext: row.ciphertext,
          iv: row.iv,
          authTag: row.authTag,
          keyVersion: row.keyVersion,
        },
      );
      return { ...base, text, status: row.status };
    } catch (error) {
      if (!(error instanceof TranscriptDecryptError)) throw error;
      log.warn("transcripts.unreadable", { sessionId: row.coachingSessionId, seq: row.seq });
      return { ...base, text: "", status: "unreadable" };
    }
  }

  return {
    /**
     * Request start, in ONE transaction: lock the session row, verify owner
     * (404), open (409 SESSION_ENDED), not idle > 2 h (ended now, 409
     * SESSION_IDLE), `expectedSeq` = next seq (409 STALE_THREAD); then store
     * the user message and bump `last_activity_at`.
     */
    async beginTurn(input: BeginTurnInput): Promise<BeginTurnResult> {
      let outcome: { kind: "idle" } | ({ kind: "ok" } & BeginTurnResult);
      try {
        outcome = await db.transaction(async (tx) => {
          const [session] = await tx
            .select()
            .from(coachingSessions)
            .where(
              and(
                eq(coachingSessions.id, input.sessionId),
                eq(coachingSessions.userId, input.userId),
              ),
            )
            .for("update")
            .limit(1);
          if (!session) throw new NotFoundError("Session not found.");
          if (session.endedAt) {
            throw new ConflictError("This session has ended. Start a new one.", "SESSION_ENDED");
          }
          if (input.now.getTime() - session.lastActivityAt.getTime() > SESSION_IDLE_MS) {
            await tx
              .update(coachingSessions)
              .set({ endedAt: input.now, updatedAt: input.now })
              .where(eq(coachingSessions.id, session.id));
            return { kind: "idle" as const };
          }

          let userSeq: number | null = null;
          if (input.expectedSeq !== null) {
            const next = await nextSeqOf(tx, session.id);
            if (input.expectedSeq !== next) throw staleThread();
            const enc = encryptMessage(
              keyring,
              { userId: input.userId, sessionId: session.id, seq: next },
              input.text,
            );
            await tx.insert(sessionMessages).values({
              coachingSessionId: session.id,
              userId: input.userId,
              role: "user",
              seq: next,
              ...enc,
              status: "ok",
              createdAt: input.now,
            });
            userSeq = next;
          }
          const [updated] = await tx
            .update(coachingSessions)
            .set({ lastActivityAt: input.now, updatedAt: input.now })
            .where(eq(coachingSessions.id, session.id))
            .returning();
          return {
            kind: "ok" as const,
            session: updated ?? session,
            userSeq,
            // The assistant row (ok or failed) always takes userSeq + 1.
            nextSeq: userSeq === null ? null : userSeq + 2,
          };
        });
      } catch (error) {
        // Two tabs racing on the same seq: the unique index is the backstop.
        if (isUniqueViolation(error)) throw staleThread();
        throw error;
      }
      if (outcome.kind === "idle") {
        throw new ConflictError(
          "This session ended after 2 hours without activity. Start a new one — your coach still remembers you.",
          "SESSION_IDLE",
        );
      }
      const { kind: _kind, ...result } = outcome;
      return result;
    },

    /** Stream end: the reply (or `[response failed]`) at `seq`, in its own transaction. */
    async appendAssistant(input: {
      userId: string;
      sessionId: string;
      seq: number;
      text: string;
      status: "ok" | "failed";
      now: Date;
    }): Promise<void> {
      const text = input.status === "failed" ? FAILED_REPLY_TEXT : input.text;
      const enc = encryptMessage(
        keyring,
        { userId: input.userId, sessionId: input.sessionId, seq: input.seq },
        text,
      );
      await db.transaction(async (tx) => {
        await tx.insert(sessionMessages).values({
          coachingSessionId: input.sessionId,
          userId: input.userId,
          role: "assistant",
          seq: input.seq,
          ...enc,
          status: input.status,
          createdAt: input.now,
        });
        await tx
          .update(coachingSessions)
          .set({ lastActivityAt: input.now })
          .where(eq(coachingSessions.id, input.sessionId));
      });
    },

    /** Owner-scoped, decrypted, ordered transcript (for the user's own viewing). */
    async listForSession(key: {
      userId: string;
      sessionId: string;
    }): Promise<{ messages: TranscriptMessage[]; nextSeq: number }> {
      const rows = await db
        .select()
        .from(sessionMessages)
        .where(
          and(
            eq(sessionMessages.coachingSessionId, key.sessionId),
            eq(sessionMessages.userId, key.userId),
          ),
        )
        .orderBy(asc(sessionMessages.seq));
      const messages = rows.map((r) => decryptRow(r, key.userId));
      const last = rows.at(-1);
      return { messages, nextSeq: last ? last.seq + 1 : 0 };
    },

    async deleteForSession(key: { userId: string; sessionId: string }): Promise<number> {
      const rows = await db
        .delete(sessionMessages)
        .where(
          and(
            eq(sessionMessages.coachingSessionId, key.sessionId),
            eq(sessionMessages.userId, key.userId),
          ),
        )
        .returning({ id: sessionMessages.id });
      return rows.length;
    },

    async deleteAllForUser(userId: string): Promise<number> {
      const rows = await db
        .delete(sessionMessages)
        .where(eq(sessionMessages.userId, userId))
        .returning({ id: sessionMessages.id });
      return rows.length;
    },

    /** Sessions (ids) that have a stored transcript, for the history list. */
    async sessionsWithTranscript(userId: string): Promise<Set<string>> {
      const rows = await db
        .selectDistinct({ id: sessionMessages.coachingSessionId })
        .from(sessionMessages)
        .where(eq(sessionMessages.userId, userId));
      return new Set(rows.map((r) => r.id));
    },
  };
}

export type TranscriptStore = ReturnType<typeof createTranscriptStore>;
