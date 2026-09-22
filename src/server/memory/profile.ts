import { coachLimits } from "@/config/coach";
import type { CoachProfile, RecalledMemory } from "@/types/memory";
import { stripUndefined } from "./memory-format";

export interface ProfileSnapshot {
  profile: CoachProfile;
  at: string;
  blobId: string;
}

/**
 * Semantic recall is not an authoritative key-value read, so we recall a few
 * candidates from the profile namespace and pick the snapshot with the newest
 * header timestamp. Malformed/untyped lines are ignored.
 */
export function selectLatestProfile(memories: readonly RecalledMemory[]): ProfileSnapshot | null {
  let best: ProfileSnapshot | null = null;
  for (const m of memories) {
    const d = m.decoded;
    if (d?.kind !== "profile" || !d.profile) continue;
    if (
      !best ||
      Date.parse(d.at) > Date.parse(best.at) ||
      (d.at === best.at && m.blobId > best.blobId)
    ) {
      best = { profile: d.profile, at: d.at, blobId: m.blobId };
    }
  }
  return best;
}

/**
 * Merge a partial update into the current profile. Present fields replace;
 * absent/empty fields keep the current value. Focus areas are replaced as a
 * list (deduped case-insensitively, capped).
 */
export function mergeProfile(
  current: CoachProfile | null,
  update: Partial<CoachProfile> | null,
): CoachProfile {
  const base: CoachProfile = { ...(current ?? {}) };
  if (!update) return stripUndefined(base);
  for (const key of ["targetRole", "company", "level", "interviewDate", "learningStyle"] as const) {
    const value = update[key];
    if (typeof value === "string" && value.trim().length > 0) {
      (base as Record<string, unknown>)[key] = value.trim();
    }
  }
  if (Array.isArray(update.focusAreas) && update.focusAreas.length > 0) {
    const seen = new Set<string>();
    const areas: string[] = [];
    for (const raw of update.focusAreas) {
      const area = raw.trim();
      const key = area.toLowerCase();
      if (area && !seen.has(key)) {
        seen.add(key);
        areas.push(area);
      }
    }
    base.focusAreas = areas.slice(0, coachLimits.maxFocusAreas);
  }
  return stripUndefined(base);
}

/** True when `update` would change the stored profile. */
export function profileChanged(current: CoachProfile | null, next: CoachProfile): boolean {
  return JSON.stringify(stripUndefined(current ?? {})) !== JSON.stringify(stripUndefined(next));
}
