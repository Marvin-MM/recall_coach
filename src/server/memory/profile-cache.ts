import { TtlCache } from "@/lib/ttl-cache";
import type { RecalledMemory } from "@/types/memory";

/** Minimal cache surface used by recall/persist (injectable in tests). */
export interface ProfileCache {
  get(namespace: string): RecalledMemory | undefined;
  set(namespace: string, memory: RecalledMemory): void;
}

/**
 * The newest profile snapshot per profile namespace, per warm instance.
 * Saves one Walrus recall per turn; refreshed whenever a new snapshot is
 * saved and expires after 10 minutes so other instances converge.
 */
export const profileCache: ProfileCache = new TtlCache<RecalledMemory>(10 * 60_000);
