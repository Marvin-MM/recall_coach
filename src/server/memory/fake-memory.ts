import { MemoryTimeoutError, MemoryUnavailableError } from "@/lib/errors";
import { sleep } from "@/lib/timeout";
import type { RecalledMemory, RememberOutcome } from "@/types/memory";
import { canonical } from "./dedup";
import { decodeMemory } from "./memory-format";
import type { MemoryPort, RecallArgs, RememberManyArgs } from "./memory-port";

export interface FakeMemoryOptions {
  /** Artificial latency for recall/remember (ms). */
  latencyMs?: number;
  /** Make recall throw. */
  failRecall?: "unavailable" | "timeout" | false;
  /** Indexes (within a rememberMany call) that should fail. */
  failRememberIndexes?: readonly number[];
  /** Seed memories per namespace. */
  seed?: Record<string, readonly string[]>;
}

export interface FakeMemoryPort extends MemoryPort {
  readonly calls: { recall: RecallArgs[]; rememberMany: RememberManyArgs[] };
  readonly store: Map<string, { blobId: string; text: string; createdAt: string }[]>;
  configure(options: Partial<FakeMemoryOptions>): void;
}

/**
 * Deterministic in-memory MemoryPort for tests and E2E (MEMORY_DRIVER=fake).
 * Recall ranks by shared-word overlap so relevant memories surface first.
 */
export function createFakeMemory(initial: FakeMemoryOptions = {}): FakeMemoryPort {
  let options: FakeMemoryOptions = { ...initial };
  let sequence = 0;
  const store = new Map<string, { blobId: string; text: string; createdAt: string }[]>();
  for (const [ns, texts] of Object.entries(initial.seed ?? {})) {
    store.set(
      ns,
      texts.map((text) => ({
        blobId: `fake-blob-${++sequence}`,
        text,
        createdAt: new Date().toISOString(),
      })),
    );
  }
  const jobBlobs = new Map<string, string>();
  const calls = { recall: [] as RecallArgs[], rememberMany: [] as RememberManyArgs[] };

  const words = (s: string) =>
    new Set(
      canonical(s)
        .split(" ")
        .filter((w) => w.length > 2),
    );

  return {
    driver: "fake",
    calls,
    store,
    configure(next) {
      options = { ...options, ...next };
    },

    async recall(args) {
      calls.recall.push(args);
      if (options.latencyMs) await sleep(options.latencyMs);
      if (options.failRecall === "timeout")
        throw new MemoryTimeoutError("fake.recall", options.latencyMs ?? 0);
      if (options.failRecall === "unavailable")
        throw new MemoryUnavailableError("fake recall failure");
      const q = words(args.query);
      const hits: RecalledMemory[] = (store.get(args.namespace) ?? []).map((m) => {
        const w = words(m.text);
        const overlap = [...q].filter((x) => w.has(x)).length;
        const distance = q.size === 0 ? 0.5 : 1 - overlap / Math.max(q.size, 1) / 1.5;
        return {
          blobId: m.blobId,
          text: m.text,
          distance,
          createdAt: m.createdAt,
          decoded: decodeMemory(m.text),
        };
      });
      return hits
        .filter(
          (h) => args.maxDistance === undefined || h.distance <= Math.max(args.maxDistance, 0.99),
        )
        .sort((a, b) => a.distance - b.distance)
        .slice(0, args.limit);
    },

    async rememberMany(args) {
      calls.rememberMany.push(args);
      const jobs = args.texts.map((_, index) => ({ index, jobId: `fake-job-${++sequence}` }));
      await args.onAccepted?.(jobs);
      if (options.latencyMs) await sleep(options.latencyMs);
      const bucket = store.get(args.namespace) ?? [];
      store.set(args.namespace, bucket);
      return jobs.map((job): RememberOutcome => {
        if (options.failRememberIndexes?.includes(job.index)) {
          return {
            ok: false,
            index: job.index,
            jobId: job.jobId,
            errorCode: "JOB_FAILED",
            latencyMs: 1,
          };
        }
        const blobId = `fake-blob-${++sequence}`;
        bucket.push({
          blobId,
          text: args.texts[job.index] ?? "",
          createdAt: new Date().toISOString(),
        });
        jobBlobs.set(job.jobId, blobId);
        return { ok: true, index: job.index, jobId: job.jobId, blobId, latencyMs: 1 };
      });
    },

    async jobStatuses(jobIds) {
      return jobIds.map((jobId) => {
        const blobId = jobBlobs.get(jobId);
        return blobId
          ? { jobId, state: "done" as const, blobId }
          : { jobId, state: "unknown" as const };
      });
    },

    async health() {
      return {
        ok: options.failRecall === false || options.failRecall === undefined,
        version: "fake",
      };
    },
  };
}
