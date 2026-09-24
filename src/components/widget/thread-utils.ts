import { coachLimits } from "@/config/coach";
import type { TranscriptMessageDto } from "@/types/api";
import type { CoachUIMessage } from "@/types/chat";
import { messageText } from "./export-conversation";

export interface ClientHistoryMessage {
  role: "user" | "assistant";
  text: string;
}

/**
 * History off: the current page's thread for ONE request (never stored).
 * Only completed user → assistant exchanges are kept, so the list alternates
 * and ends with a reply (the new message is appended by the server); failed
 * or unanswered turns are dropped. Newest ≤ 24 messages, each ≤ 4000 chars.
 */
export function buildClientHistory(previous: readonly CoachUIMessage[]): ClientHistoryMessage[] {
  const pairs: [ClientHistoryMessage, ClientHistoryMessage][] = [];
  let pendingUser: ClientHistoryMessage | null = null;
  for (const m of previous) {
    const text = messageText(m).trim().slice(0, coachLimits.maxTextPartChars);
    const failed = m.metadata?.status !== undefined && m.metadata.status !== "ok";
    if (m.role === "user") {
      pendingUser = text && !failed ? { role: "user", text } : null;
    } else if (m.role === "assistant") {
      if (pendingUser && text && !failed) pairs.push([pendingUser, { role: "assistant", text }]);
      pendingUser = null;
    }
  }
  const maxPairs = Math.floor(coachLimits.maxClientHistory / 2);
  return pairs.slice(-maxPairs).flat();
}

/** Stored transcript rows → chat messages (failed/unreadable rows keep their status). */
export function transcriptToUiMessages(rows: readonly TranscriptMessageDto[]): CoachUIMessage[] {
  return rows.map((r) => ({
    id: `seq-${r.seq}`,
    role: r.role,
    parts: r.status === "ok" ? [{ type: "text", text: r.text }] : [],
    metadata: { seq: r.seq, status: r.status, createdAt: Date.parse(r.createdAt) },
  }));
}

/** The seq to send next, from the newest assistant reply the server annotated. */
export function latestNextSeq(messages: readonly CoachUIMessage[]): number | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const seq = messages[i]?.metadata?.nextSeq;
    if (typeof seq === "number") return seq;
  }
  return undefined;
}
