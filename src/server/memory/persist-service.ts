import { randomUUID } from "node:crypto";
import { errorCode } from "@/lib/errors";
import { log } from "@/lib/log";
import { sleep as defaultSleep } from "@/lib/timeout";
import type { MemoryKind } from "@/types/domain";
import type { CoachProfile, RememberOutcome } from "@/types/memory";
import type { AcceptedJob, MemoryEventsRepo } from "../db/repositories/memory-events.repo";
import type { ExtractionResult } from "../llm/extraction";
import type { ExtractionPromptInput } from "../llm/prompts/extraction";
import { dedupeAgainst } from "./dedup";
import { classifyMemoryError } from "./errors";
import { cleanFactText, decodeMemory, encodeFact, encodeProfile } from "./memory-format";
import type { MemoryPort } from "./memory-port";
import type { MemoryNamespaces } from "./namespace";
import { mergeProfile, profileChanged } from "./profile";
import type { ProfileCache } from "./profile-cache";
import { containsInjection } from "./sanitize";

export const RETRY_DELAYS_MS = [500, 2000] as const;

/**
 * Outcomes that mean "we stopped waiting", not "the job failed". Mainnet
 * saves routinely take 30 s+, so these rows stay `pending` and are completed
 * later by `reconcilePendingJobs` (summary polling / cron).
 */
const STILL_PENDING_CODES = new Set([
  "MEMORY_TIMEOUT",
  "MEMORY_UNAVAILABLE",
  "MEMORY_CIRCUIT_OPEN",
]);

export interface PersistDeps {
  memory: MemoryPort;
  profileCache?: ProfileCache;
  memoryEvents: MemoryEventsRepo;
  extract: (input: ExtractionPromptInput) => Promise<ExtractionResult>;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

export interface StoreItem {
  kind: MemoryKind;
  /** Fully encoded memory line. */
  line: string;
}

export interface StoreSummary {
  accepted: number;
  done: number;
  failed: number;
  pending: number;
  /** Blob ids of stored items, by input index. */
  stored: { index: number; blobId: string }[];
}

export interface PersistSummary extends Omit<StoreSummary, "stored"> {
  extracted: number;
  droppedDup: number;
  droppedInjection: number;
  profileUpdated: boolean;
  latencyMs: number;
  error: string | null;
}

interface StoreArgs {
  userId: string;
  sessionId: string | null;
  namespace: string;
  items: readonly StoreItem[];
}

/**
 * Remember `items` in one namespace with full metadata bookkeeping:
 * pending rows are written (one transaction) as soon as the relayer accepts
 * the jobs, then completed (one transaction per batch) as done/failed.
 *
 * Retries (500 ms, 2 s) cover two cases, both safe because no blob exists:
 * - submissions that were never accepted (network/5xx/429 from the relayer);
 * - accepted jobs the relayer reports as failed for a transient upstream
 *   reason (e.g. Sui RPC "Too Many Requests"). The existing metadata row is
 *   re-pointed to the new job id, so one memory = one row.
 */
export async function storeMemories(deps: PersistDeps, args: StoreArgs): Promise<StoreSummary> {
  const sleep = deps.sleep ?? defaultSleep;
  if (args.items.length === 0) return { accepted: 0, done: 0, failed: 0, pending: 0, stored: [] };

  const final = new Map<number, RememberOutcome>();
  const rowJobId = new Map<number, string>();
  let toSubmit = args.items.map((_, i) => i);
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length && toSubmit.length > 0; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 0);
    const batch = toSubmit;
    const isLastAttempt = attempt === RETRY_DELAYS_MS.length;
    let outcomes: RememberOutcome[];
    try {
      outcomes = await deps.memory.rememberMany({
        namespace: args.namespace,
        texts: batch.map((i) => args.items[i]?.line ?? ""),
        onAccepted: async (jobs) => {
          const fresh: AcceptedJob[] = [];
          for (const job of jobs) {
            const idx = batch[job.index];
            if (idx === undefined) continue;
            const previous = rowJobId.get(idx);
            rowJobId.set(idx, job.jobId);
            if (previous) {
              await deps.memoryEvents.replaceJob(previous, job.jobId);
            } else {
              fresh.push({
                userId: args.userId,
                coachingSessionId: args.sessionId,
                namespace: args.namespace,
                kind: args.items[idx]?.kind ?? "goal",
                jobId: job.jobId,
              });
            }
          }
          await deps.memoryEvents.recordAcceptedJobs(fresh);
        },
      });
    } catch (error) {
      lastError = error;
      if (!classifyMemoryError(error).transient) break;
      continue;
    }

    const retry: number[] = [];
    for (const o of outcomes) {
      const idx = batch[o.index];
      if (idx === undefined) continue;
      const retryable = !o.ok && (o.errorCode === "JOB_FAILED_TRANSIENT" || o.jobId === null);
      if (!o.ok) {
        log.warn("memory.job_failed", {
          errorCode: o.errorCode,
          detail: o.detail ?? null,
          attempt,
          willRetry: retryable && !isLastAttempt,
        });
      }
      if (retryable && !isLastAttempt) retry.push(idx);
      else final.set(idx, { ...o, index: idx });
    }
    toSubmit = retry;
  }

  // Items that never got a final outcome (retries exhausted on thrown errors).
  const code = lastError === undefined ? "JOB_FAILED" : classifyMemoryError(lastError).error.code;
  for (const idx of toSubmit) {
    if (!final.has(idx)) {
      final.set(idx, {
        ok: false,
        index: idx,
        jobId: rowJobId.get(idx) ?? null,
        errorCode: code,
        latencyMs: null,
      });
    }
  }

  const outcomes = [...final.values()].sort((a, b) => a.index - b.index);
  const done = outcomes.filter((o): o is Extract<RememberOutcome, { ok: true }> => o.ok);
  const failures = outcomes.filter((o): o is Extract<RememberOutcome, { ok: false }> => !o.ok);
  const stillPending = failures.filter(
    (o) => o.jobId !== null && STILL_PENDING_CODES.has(o.errorCode),
  );
  const failedAccepted = failures.filter(
    (o): o is Extract<RememberOutcome, { ok: false }> & { jobId: string } =>
      o.jobId !== null && !STILL_PENDING_CODES.has(o.errorCode),
  );
  const unaccepted = failures.filter((o) => o.jobId === null);

  let doneCount = done.length;
  try {
    const res = await deps.memoryEvents.markJobsDone(
      done.map((o) => ({ jobId: o.jobId, blobId: o.blobId, latencyMs: o.latencyMs })),
    );
    doneCount = res.done;
    await deps.memoryEvents.markJobsFailed(
      failedAccepted.map((o) => ({
        jobId: o.jobId,
        errorCode: o.errorCode,
        latencyMs: o.latencyMs,
      })),
    );
    if (unaccepted.length > 0) {
      // Never accepted: record failed rows (synthetic job ids) so the session
      // summary can honestly say "N memories couldn't be saved".
      const rows = unaccepted.map((o) => ({
        userId: args.userId,
        coachingSessionId: args.sessionId,
        namespace: args.namespace,
        kind: args.items[o.index]?.kind ?? ("goal" as const),
        jobId: `unaccepted-${randomUUID()}`,
      }));
      await deps.memoryEvents.recordAcceptedJobs(rows);
      await deps.memoryEvents.markJobsFailed(
        rows.map((r, i) => ({
          jobId: r.jobId,
          errorCode: unaccepted[i]?.errorCode ?? code,
          latencyMs: null,
        })),
      );
    }
  } catch (error) {
    log.error("memory.bookkeeping_failed", { stage: "complete", error });
  }

  return {
    accepted: outcomes.length - unaccepted.length,
    done: doneCount,
    failed: outcomes.length - doneCount - stillPending.length,
    pending: stillPending.length,
    stored: done.map((o) => ({ index: o.index, blobId: o.blobId })),
  };
}

/** Refresh the profile cache after a snapshot is durably stored. */
function cacheStoredProfile(
  deps: PersistDeps,
  namespace: string,
  items: readonly StoreItem[],
  summary: StoreSummary,
): void {
  const stored = summary.stored[0];
  const item = stored ? items[stored.index] : undefined;
  if (!deps.profileCache || !stored || !item) return;
  deps.profileCache.set(namespace, {
    blobId: stored.blobId,
    text: item.line,
    distance: 0,
    decoded: decodeMemory(item.line),
  });
}

export interface PersistTurnInput {
  userId: string;
  sessionId: string;
  namespaces: MemoryNamespaces;
  lastUserText: string;
  assistantText: string;
  profile: CoachProfile | null;
  /** Texts (decoded bodies) recalled this turn, for near-duplicate dropping. */
  recalledTexts: readonly string[];
  /** Known past mistakes, so the extractor can log improvements. */
  knownMistakes: readonly string[];
}

/** Post-response persistence for one chat turn (runs inside `after()`). */
export async function persistTurn(
  deps: PersistDeps,
  input: PersistTurnInput,
): Promise<PersistSummary> {
  const now = deps.now ?? (() => new Date());
  const startedAt = Date.now();
  const at = now();
  const summary: PersistSummary = {
    extracted: 0,
    accepted: 0,
    done: 0,
    failed: 0,
    pending: 0,
    droppedDup: 0,
    droppedInjection: 0,
    profileUpdated: false,
    latencyMs: 0,
    error: null,
  };

  try {
    let extraction: ExtractionResult;
    try {
      extraction = await deps.extract({
        lastUserText: input.lastUserText,
        assistantText: input.assistantText,
        profile: input.profile,
        knownMistakes: input.knownMistakes,
        now: at,
      });
    } catch (error) {
      summary.error = errorCode(error);
      return summary;
    }
    summary.extracted = extraction.facts.length;

    // Sanitize: drop anything that reads like an instruction to the model.
    const safe = extraction.facts.filter((f) => !containsInjection(f.text));
    summary.droppedInjection = extraction.facts.length - safe.length;
    const cleaned = safe
      .map((f) => ({ kind: f.kind, text: cleanFactText(f.text) }))
      .filter((f) => f.text.length >= 8 && !containsInjection(f.text));
    summary.droppedInjection += safe.length - cleaned.length;

    // Dedup against this turn's recalled memories and within the batch.
    const { kept, dropped } = dedupeAgainst(cleaned, input.recalledTexts, (f) => f.text);
    summary.droppedDup = dropped;

    const factItems: StoreItem[] = kept.map((f) => ({
      kind: f.kind,
      line: encodeFact({ kind: f.kind, text: f.text, at, sessionId: input.sessionId }),
    }));

    const merged = extraction.profileUpdate
      ? mergeProfile(input.profile, extraction.profileUpdate)
      : null;
    const profileItems: StoreItem[] =
      merged && profileChanged(input.profile, merged)
        ? [{ kind: "profile", line: encodeProfile({ profile: merged, at }) }]
        : [];
    summary.profileUpdated = profileItems.length > 0;

    const [facts, profile] = await Promise.all([
      storeMemories(deps, {
        userId: input.userId,
        sessionId: input.sessionId,
        namespace: input.namespaces.facts,
        items: factItems,
      }),
      storeMemories(deps, {
        userId: input.userId,
        sessionId: input.sessionId,
        namespace: input.namespaces.profile,
        items: profileItems,
      }),
    ]);
    summary.accepted = facts.accepted + profile.accepted;
    summary.done = facts.done + profile.done;
    summary.failed = facts.failed + profile.failed;
    summary.pending = facts.pending + profile.pending;
    cacheStoredProfile(deps, input.namespaces.profile, profileItems, profile);
    return summary;
  } catch (error) {
    summary.error = errorCode(error);
    log.error("memory.persist_failed", { userId: input.userId, sessionId: input.sessionId, error });
    return summary;
  } finally {
    summary.latencyMs = Date.now() - startedAt;
    log.info("memory.persist", {
      userId: input.userId,
      sessionId: input.sessionId,
      accepted: summary.accepted,
      done: summary.done,
      failed: summary.failed,
      pending: summary.pending,
      droppedDup: summary.droppedDup,
      droppedInjection: summary.droppedInjection,
      profileUpdated: summary.profileUpdated,
      latencyMs: summary.latencyMs,
      error: summary.error,
    });
  }
}

export interface OnboardingPersistInput {
  userId: string;
  namespaces: MemoryNamespaces;
  profile: CoachProfile;
  focusAreas: readonly string[];
}

/** Initial profile snapshot + one goal fact per focus area. */
export async function persistOnboarding(
  deps: PersistDeps,
  input: OnboardingPersistInput,
): Promise<StoreSummary> {
  const at = (deps.now ?? (() => new Date()))();
  const factItems: StoreItem[] = input.focusAreas
    .map((area) => cleanFactText(area))
    .filter((area) => area.length > 0 && !containsInjection(area))
    .map((area) => ({
      kind: "goal" as const,
      line: encodeFact({ kind: "goal", text: `The user wants to improve at: ${area}.`, at }),
    }));
  const profileItems: StoreItem[] = [
    { kind: "profile", line: encodeProfile({ profile: input.profile, at }) },
  ];
  const [facts, profile] = await Promise.all([
    storeMemories(deps, {
      userId: input.userId,
      sessionId: null,
      namespace: input.namespaces.facts,
      items: factItems,
    }),
    storeMemories(deps, {
      userId: input.userId,
      sessionId: null,
      namespace: input.namespaces.profile,
      items: profileItems,
    }),
  ]);
  cacheStoredProfile(deps, input.namespaces.profile, profileItems, profile);
  return {
    accepted: facts.accepted + profile.accepted,
    done: facts.done + profile.done,
    failed: facts.failed + profile.failed,
    pending: facts.pending + profile.pending,
    stored: [...facts.stored, ...profile.stored],
  };
}
