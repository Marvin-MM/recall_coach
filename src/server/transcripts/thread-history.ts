import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { getDb } from "@/server/db/client";
import { coachingSessions, sessionMessages } from "@/server/db/schema";
import type { Queryable } from "@/server/db/types";
import {
  decryptMessage,
  envKeyring,
  TranscriptDecryptError,
  type TranscriptKeyring,
} from "./crypto";

/**
 * THE ONLY transcript reader the coach may use (enforced by Biome's
 * noRestrictedImports and tests/unit/transcripts/import-guard.test.ts).
 *
 * It returns the CURRENT, unfinished session's own messages — nothing from
 * any other session, ever. Cross-session continuity comes only from Walrus
 * Memory. Failed and unreadable rows are skipped.
 */

export interface ThreadMessage {
  role: "user" | "assistant";
  text: string;
  seq: number;
}

export interface ThreadHistoryArgs {
  userId: string;
  sessionId: string;
  /** User/assistant exchanges to return (the newest ones). */
  maxTurns: number;
}

interface ThreadHistoryDeps {
  db: Queryable;
  keyring: TranscriptKeyring;
}

function productionDeps(): ThreadHistoryDeps {
  return { db: getDb(), keyring: envKeyring() };
}

export async function loadThreadHistory(
  args: ThreadHistoryArgs,
  deps?: ThreadHistoryDeps,
): Promise<ThreadMessage[]> {
  const { db, keyring } = deps ?? productionDeps();

  const [session] = await db
    .select({ id: coachingSessions.id, endedAt: coachingSessions.endedAt })
    .from(coachingSessions)
    .where(and(eq(coachingSessions.id, args.sessionId), eq(coachingSessions.userId, args.userId)))
    .limit(1);
  if (!session) throw new NotFoundError("Session not found.");
  if (session.endedAt) {
    throw new ConflictError("This session has ended. Start a new one.", "SESSION_ENDED");
  }

  const limit = Math.max(1, Math.floor(args.maxTurns)) * 2;
  const rows = await db
    .select()
    .from(sessionMessages)
    .where(
      and(
        eq(sessionMessages.coachingSessionId, args.sessionId),
        eq(sessionMessages.userId, args.userId),
        eq(sessionMessages.status, "ok"),
      ),
    )
    .orderBy(desc(sessionMessages.seq))
    .limit(limit);

  const thread: ThreadMessage[] = [];
  for (const row of rows.reverse()) {
    try {
      const text = decryptMessage(
        keyring,
        { userId: args.userId, sessionId: args.sessionId, seq: row.seq },
        {
          ciphertext: row.ciphertext,
          iv: row.iv,
          authTag: row.authTag,
          keyVersion: row.keyVersion,
        },
      );
      thread.push({ role: row.role, text, seq: row.seq });
    } catch (error) {
      if (!(error instanceof TranscriptDecryptError)) throw error;
      // Unreadable rows (lost key, tampering) are left out of the model input.
    }
  }
  // The model input starts with a user turn.
  while (thread[0] && thread[0].role !== "user") thread.shift();
  return thread;
}
