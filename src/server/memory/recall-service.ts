import { coachLimits, RECALL_QUERIES } from "@/config/coach";
import { errorCode, MemoryTimeoutError } from "@/lib/errors";
import { log } from "@/lib/log";
import { sleep as defaultSleep, withTimeout } from "@/lib/timeout";
import type { CoachingMode } from "@/types/domain";
import type { CoachProfile, RecalledMemory } from "@/types/memory";
import { type LatestAssignment, selectLatestAssignment } from "./assignment";
import type { AssignmentCache } from "./assignment-cache";
import type { MemoryPort } from "./memory-port";
import type { MemoryNamespaces } from "./namespace";
import { detectPatterns, type MistakePattern } from "./patterns";
import { selectLatestProfile } from "./profile";
import type { ProfileCache } from "./profile-cache";

export interface TurnRecallInput {
  namespaces: MemoryNamespaces;
  mode: CoachingMode;
  lastUserText: string;
  firstTurn: boolean;
  /** Current session: its own mistakes don't count towards cross-session patterns. */
  sessionId?: string | null;
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
  /** Latest assignment (opening recap reads it from Walrus; later turns may use the cache). */
  assignment: LatestAssignment | null;
  /** Mistake tags seen in ≥ 2 earlier sessions among the recalled lines. */
  patterns: MistakePattern[];
  /** 1, or 2 when the recall was retried once (all dropped / unexpectedly empty). */
  attempt: 1 | 2;
}

export interface RecallServiceDeps {
  memory: MemoryPort;
  timeoutMs: number;
  profileCache?: ProfileCache;
  assignmentCache?: AssignmentCache;
  /** Does the user have ≥ 1 saved (`done`) memory? Asked only when a recall came back empty. */
  hasSavedMemories?: () => Promise<boolean>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** One retry after an all-dropped / unexpectedly empty recall, inside the recall timeout. */
export const RECALL_RETRY_DELAY_MS = 400;
/** Skip the retry when less than this would be left of the timeout after the delay. */
const MIN_RETRY_BUDGET_MS = 800;

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
    assignment: null,
    patterns: [],
    attempt: 1,
  };
}

type Settled = PromiseSettledResult<RecalledMemory[]>;
type Task = (() => Promise<RecalledMemory[]>) | null;

const isDropped = (r: Settled | undefined) =>
  r?.status === "rejected" && errorCode(r.reason) === "MEMORY_RECALL_DROPPED";

/**
 * Per-turn recall: facts (query = last user message), profile snapshot, the
 * latest assignment and — on the first turn — a "most recent" recap, all in
 * parallel and bounded by the recall timeout. If every match of a recall was
 * dropped, or everything came back empty while the user has saved memories,
 * the affected recalls are retried once (~400 ms later, inside the timeout)
 * before degrading. Never throws: failures return `degraded`.
 */
export async function recallForTurn(
  deps: RecallServiceDeps,
  input: TurnRecallInput,
): Promise<TurnRecall> {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? defaultSleep;
  if (deps.memory.driver === "noop") return emptyRecall();
  const started = now();
  const cachedProfile = deps.profileCache?.get(input.namespaces.profile);
  // A new session's opening always reads the assignment from Walrus Memory.
  const cachedAssignment = input.firstTurn
    ? undefined
    : deps.assignmentCache?.get(input.namespaces.facts);

  const tasks: Task[] = [
    () =>
      deps.memory.recall({
        namespace: input.namespaces.facts,
        query: chooseFactsQuery(input.lastUserText, input.mode),
        limit: coachLimits.factsLimit,
        maxDistance: coachLimits.factsMaxDistance,
      }),
    cachedProfile
      ? null
      : () =>
          deps.memory.recall({
            namespace: input.namespaces.profile,
            query: RECALL_QUERIES.profile,
            limit: coachLimits.profileLimit,
          }),
    input.firstTurn
      ? () =>
          deps.memory.recall({
            namespace: input.namespaces.facts,
            query: RECALL_QUERIES.recap,
            limit: coachLimits.recapLimit,
          })
      : null,
    cachedAssignment
      ? null
      : () =>
          deps.memory.recall({
            namespace: input.namespaces.facts,
            query: RECALL_QUERIES.assignment,
            limit: coachLimits.assignmentLimit,
          }),
  ];

  const run = async (which: readonly Task[], budgetMs: number): Promise<Settled[]> => {
    const pending = which.map((t) => (t ? t() : Promise.resolve([])));
    try {
      // Adapters time out individually; this guard also bounds fakes/slow paths.
      return await withTimeout(Promise.allSettled(pending), budgetMs, "memory.recallForTurn");
    } catch {
      const timeout = new MemoryTimeoutError("memory.recallForTurn", deps.timeoutMs);
      return which.map(() => ({ status: "rejected", reason: timeout }));
    }
  };

  const budget = deps.timeoutMs + 250;
  let settled = await run(tasks, budget);
  let attempt: 1 | 2 = 1;

  // Retry once: all matches dropped (transient relayer download/decrypt
  // failure), or every recall empty although this user has saved memories.
  const anyDropped = settled.some(isDropped);
  const allEmpty =
    !cachedProfile &&
    !cachedAssignment &&
    settled.every(
      (r, i) => tasks[i] === null || (r.status === "fulfilled" && r.value.length === 0),
    );
  const remaining = budget - (now() - started) - RECALL_RETRY_DELAY_MS;
  if ((anyDropped || allEmpty) && remaining >= MIN_RETRY_BUDGET_MS) {
    const worthIt = anyDropped || ((await deps.hasSavedMemories?.().catch(() => false)) ?? false);
    if (worthIt) {
      const retryTasks = tasks.map((t, i) =>
        t && (isDropped(settled[i]) || (!anyDropped && allEmpty)) ? t : null,
      );
      await sleep(RECALL_RETRY_DELAY_MS);
      const second = await run(retryTasks, Math.max(0, budget - (now() - started)));
      settled = settled.map((r, i) => (retryTasks[i] ? (second[i] ?? r) : r));
      attempt = 2;
      log.info("memory.recall_retry", {
        reason: anyDropped ? "dropped" : "empty",
        recovered: second.some(
          (r, i) => retryTasks[i] !== null && r.status === "fulfilled" && r.value.length > 0,
        ),
      });
    }
  }

  const [factsRes, profileRes, recapRes, assignmentRes] = settled;
  const failures = settled.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  const value = (r: Settled | undefined) => (r?.status === "fulfilled" ? r.value : []);

  const profileCandidates = cachedProfile ? [cachedProfile] : value(profileRes);
  const profileSnapshot = selectLatestProfile(profileCandidates);
  const profileMemory = profileSnapshot
    ? (profileCandidates.find((m) => m.blobId === profileSnapshot.blobId) ?? null)
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

  // Latest assignment: from the cache on later turns, else from everything recalled.
  let assignment: LatestAssignment | null;
  if (cachedAssignment) {
    assignment = cachedAssignment.memory
      ? selectLatestAssignment([cachedAssignment.memory, ...recap, ...facts])
      : null;
  } else {
    assignment = selectLatestAssignment([...value(assignmentRes), ...recap, ...facts]);
    if (assignmentRes?.status === "fulfilled") {
      deps.assignmentCache?.set(input.namespaces.facts, {
        memory: assignment && !assignment.completed ? assignment.memory : null,
      });
    }
  }
  if (assignment?.completed) assignment = null;

  const patterns = detectPatterns(
    [...recap, ...facts, ...value(assignmentRes)],
    input.sessionId ?? null,
  );

  const factsFailed = factsRes?.status === "rejected";
  const profileFailed = !cachedProfile && profileRes?.status === "rejected";
  const degraded = factsFailed && profileFailed;
  const firstCode = failures[0] ? errorCode(failures[0].reason) : null;
  const reason = failures.length === 0 ? null : degraded ? firstCode : `partial:${firstCode}`;
  if (failures.length > 0) {
    log.warn("memory.recall_failed", { failures: failures.length, reason, attempt });
  }

  const shownAssignment =
    assignment && !seen.has(assignment.memory.blobId) && assignment.memory.blobId.length > 0
      ? [assignment.memory]
      : [];
  const all = [...(profileMemory ? [profileMemory] : []), ...recap, ...facts, ...shownAssignment];
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
    assignment,
    patterns,
    attempt,
  };
}
