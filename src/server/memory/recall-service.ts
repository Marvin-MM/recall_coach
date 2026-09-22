import { coachLimits, RECALL_QUERIES } from "@/config/coach";
import { errorCode, MemoryTimeoutError } from "@/lib/errors";
import { log } from "@/lib/log";
import { withTimeout } from "@/lib/timeout";
import type { CoachingMode } from "@/types/domain";
import type { CoachProfile, RecalledMemory } from "@/types/memory";
import type { MemoryPort } from "./memory-port";
import type { MemoryNamespaces } from "./namespace";
import { selectLatestProfile } from "./profile";
import type { ProfileCache } from "./profile-cache";

export interface TurnRecallInput {
  namespaces: MemoryNamespaces;
  mode: CoachingMode;
  lastUserText: string;
  firstTurn: boolean;
}

export interface TurnRecall {
  profile: CoachProfile | null;
  profileMemory: RecalledMemory | null;
  facts: RecalledMemory[];
  recap: RecalledMemory[];
  /** True when no memory could be read at all this turn. */
  degraded: boolean;
  /** Error code for degraded/partial recalls (e.g. MEMORY_TIMEOUT, partial:MEMORY_UNAVAILABLE). */
  reason: string | null;
  latencyMs: number;
  /** Unique blob ids surfaced to the model (profile + recap + facts). */
  blobIds: string[];
  bestDistance: number | null;
}

export interface RecallServiceDeps {
  memory: MemoryPort;
  timeoutMs: number;
  profileCache?: ProfileCache;
  now?: () => number;
}

const MIN_MEANINGFUL_CHARS = 3;
const MAX_QUERY_CHARS = 500;

export function chooseFactsQuery(lastUserText: string, mode: CoachingMode): string {
  const trimmed = lastUserText.trim();
  const meaningful = trimmed.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  if (meaningful < MIN_MEANINGFUL_CHARS) return RECALL_QUERIES.fallbackByMode[mode];
  return trimmed.slice(0, MAX_QUERY_CHARS);
}

const byNewest = (a: RecalledMemory, b: RecalledMemory) =>
  Date.parse(b.decoded?.at ?? b.createdAt ?? "0") - Date.parse(a.decoded?.at ?? a.createdAt ?? "0");

const isFact = (m: RecalledMemory) => m.decoded?.kind !== "profile";

export function emptyRecall(latencyMs = 0): TurnRecall {
  return {
    profile: null,
    profileMemory: null,
    facts: [],
    recap: [],
    degraded: false,
    reason: null,
    latencyMs,
    blobIds: [],
    bestDistance: null,
  };
}

/**
 * Per-turn recall: facts (query = last user message), profile snapshot and —
 * on the first turn — a "most recent" recap, all in parallel and bounded by
 * the recall timeout. Never throws: failures return `degraded`.
 */
export async function recallForTurn(
  deps: RecallServiceDeps,
  input: TurnRecallInput,
): Promise<TurnRecall> {
  const now = deps.now ?? Date.now;
  if (deps.memory.driver === "noop") return emptyRecall();
  const started = now();
  const cachedProfile = deps.profileCache?.get(input.namespaces.profile);

  const tasks: Promise<RecalledMemory[]>[] = [
    deps.memory.recall({
      namespace: input.namespaces.facts,
      query: chooseFactsQuery(input.lastUserText, input.mode),
      limit: coachLimits.factsLimit,
      maxDistance: coachLimits.factsMaxDistance,
    }),
    cachedProfile
      ? Promise.resolve([cachedProfile])
      : deps.memory.recall({
          namespace: input.namespaces.profile,
          query: RECALL_QUERIES.profile,
          limit: coachLimits.profileLimit,
        }),
    input.firstTurn
      ? deps.memory.recall({
          namespace: input.namespaces.facts,
          query: RECALL_QUERIES.recap,
          limit: coachLimits.recapLimit,
        })
      : Promise.resolve([]),
  ];

  let settled: PromiseSettledResult<RecalledMemory[]>[];
  try {
    // Adapters time out individually; this guard also bounds fakes/slow paths.
    settled = await withTimeout(
      Promise.allSettled(tasks),
      deps.timeoutMs + 250,
      "memory.recallForTurn",
    );
  } catch {
    const timeout = new MemoryTimeoutError("memory.recallForTurn", deps.timeoutMs);
    settled = tasks.map(() => ({ status: "rejected", reason: timeout }));
  }

  const [factsRes, profileRes, recapRes] = settled;
  const failures = settled.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  const value = (r: PromiseSettledResult<RecalledMemory[]> | undefined) =>
    r?.status === "fulfilled" ? r.value : [];

  const profileSnapshot = selectLatestProfile(value(profileRes));
  const profileMemory = profileSnapshot
    ? (value(profileRes).find((m) => m.blobId === profileSnapshot.blobId) ?? null)
    : null;

  if (profileMemory && !cachedProfile)
    deps.profileCache?.set(input.namespaces.profile, profileMemory);

  const seen = new Set<string>(profileMemory ? [profileMemory.blobId] : []);
  const recap = value(recapRes)
    .filter(isFact)
    .sort(byNewest)
    .filter((m) => !seen.has(m.blobId) && seen.add(m.blobId));
  const facts = value(factsRes)
    .filter(isFact)
    .sort((a, b) => a.distance - b.distance)
    .filter((m) => !seen.has(m.blobId) && seen.add(m.blobId));

  const factsFailed = factsRes?.status === "rejected";
  const profileFailed = profileRes?.status === "rejected";
  const degraded = factsFailed && profileFailed;
  const firstCode = failures[0] ? errorCode(failures[0].reason) : null;
  const reason = failures.length === 0 ? null : degraded ? firstCode : `partial:${firstCode}`;
  if (failures.length > 0) {
    log.warn("memory.recall_failed", { failures: failures.length, reason });
  }

  const all = [...(profileMemory ? [profileMemory] : []), ...recap, ...facts];
  const distances = all.map((m) => m.distance).filter((d) => Number.isFinite(d));
  return {
    profile: profileSnapshot?.profile ?? null,
    profileMemory,
    facts,
    recap,
    degraded,
    reason,
    latencyMs: Math.max(0, now() - started),
    blobIds: all.map((m) => m.blobId),
    bestDistance: distances.length > 0 ? Math.min(...distances) : null,
  };
}
