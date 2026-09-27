import type { RecalledMemory } from "@/types/memory";
import { type MemoryTag, toMemoryTag } from "./tags";

/** A tag seen in mistakes from at least `PATTERN_MIN_SESSIONS` earlier sessions. */
export interface MistakePattern {
  tag: MemoryTag;
  /** Distinct earlier sessions among the RECALLED lines (not all of history). */
  sessions: number;
}

export const PATTERN_MIN_SESSIONS = 2;

/**
 * Count recalled `mistake` lines per tag across distinct `session=` values.
 * Only earlier sessions count (the current one is excluded), lines without a
 * session (setup notes) can't be attributed, legacy untagged lines count as
 * `other`, and `other` never forms a pattern (it is "uncategorized", not a
 * habit). Returns every tag's count, highest first; callers filter by
 * `PATTERN_MIN_SESSIONS`.
 */
export function countMistakeSessions(
  memories: readonly RecalledMemory[],
  currentSessionId: string | null,
): MistakePattern[] {
  const sessionsByTag = new Map<MemoryTag, Set<string>>();
  const seenBlobs = new Set<string>();
  for (const m of memories) {
    const d = m.decoded;
    if (d?.kind !== "mistake" || !d.sessionId || d.sessionId === currentSessionId) continue;
    if (m.blobId && seenBlobs.has(m.blobId)) continue;
    if (m.blobId) seenBlobs.add(m.blobId);
    const tag = toMemoryTag(d.tag);
    const set = sessionsByTag.get(tag) ?? new Set<string>();
    set.add(d.sessionId);
    sessionsByTag.set(tag, set);
  }
  return [...sessionsByTag.entries()]
    .map(([tag, set]) => ({ tag, sessions: set.size }))
    .sort((a, b) => b.sessions - a.sessions || a.tag.localeCompare(b.tag));
}

/** Tags that repeat across ≥ 2 earlier sessions (excluding `other`). */
export function detectPatterns(
  memories: readonly RecalledMemory[],
  currentSessionId: string | null,
): MistakePattern[] {
  return countMistakeSessions(memories, currentSessionId).filter(
    (p) => p.tag !== "other" && p.sessions >= PATTERN_MIN_SESSIONS,
  );
}
