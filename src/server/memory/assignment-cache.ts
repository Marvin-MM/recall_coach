import { TtlCache } from "@/lib/ttl-cache";
import type { RecalledMemory } from "@/types/memory";

/** `memory: null` = known: no open assignment (e.g. it was just completed). */
export interface CachedAssignment {
  memory: RecalledMemory | null;
}

export interface AssignmentCache {
  get(namespace: string): CachedAssignment | undefined;
  set(namespace: string, value: CachedAssignment): void;
}

/**
 * The latest assignment per facts namespace, per warm instance. Recalled
 * from Walrus Memory on a miss (so a new session's opening always reads it
 * from Walrus); later turns reuse it instead of one extra recall per turn.
 * Expires after 10 minutes so other instances converge.
 */
export const assignmentCache: AssignmentCache = new TtlCache<CachedAssignment>(10 * 60_000);
