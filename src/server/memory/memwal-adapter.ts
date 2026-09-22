import "server-only";
import type {
  HealthResult,
  RecallParams,
  RecallResult,
  RememberBulkAcceptedResult,
  RememberBulkItem,
  RememberBulkOptions,
  RememberBulkResult,
  RememberBulkStatusResult,
} from "@mysten-incubation/memwal";
import { MemWal } from "@mysten-incubation/memwal";
import { coachLimits } from "@/config/coach";
import { MemoryTimeoutError } from "@/lib/errors";
import { log, logOnce } from "@/lib/log";
import { withTimeout } from "@/lib/timeout";
import type { AcceptedMemoryJob, RecalledMemory, RememberOutcome } from "@/types/memory";
import { classifyMemoryError } from "./errors";
import { decodeMemory } from "./memory-format";
import type {
  MemoryHealth,
  MemoryJobStatus,
  MemoryPort,
  RecallArgs,
  RememberManyArgs,
} from "./memory-port";

/** The subset of the MemWal client we use (MemWal and MemWalMock both satisfy it). */
export interface MemWalLike {
  recall(params: RecallParams): Promise<RecallResult>;
  rememberBulkAsync(items: RememberBulkItem[]): Promise<RememberBulkAcceptedResult>;
  waitForRememberJobs(
    jobIds: string[],
    namespaces?: string[],
    opts?: RememberBulkOptions,
  ): Promise<RememberBulkResult>;
  getRememberBulkStatus(
    jobIds: string[],
    opts?: { timeoutMs?: number },
  ): Promise<RememberBulkStatusResult>;
  health(): Promise<HealthResult>;
}

export interface MemWalAdapterConfig {
  recallTimeoutMs: number;
  saveTimeoutMs: number;
  /** Status poll interval while waiting for jobs. */
  pollIntervalMs?: number;
  now?: () => number;
}

export interface MemWalClientConfig {
  key: string;
  accountId: string;
  serverUrl: string;
  requestTimeoutMs?: number;
}

const clients = new Map<string, MemWal>();

/** One MemWal client per warm instance (keys stay in this process only). */
export function getMemWalClient(config: MemWalClientConfig): MemWal {
  const cacheKey = `${config.accountId}@${config.serverUrl}`;
  let client = clients.get(cacheKey);
  if (!client) {
    client = MemWal.create({
      key: config.key,
      accountId: config.accountId,
      serverUrl: config.serverUrl,
      ...(config.requestTimeoutMs === undefined
        ? {}
        : { requestTimeoutMs: config.requestTimeoutMs }),
    });
    clients.set(cacheKey, client);
  }
  return client;
}

/**
 * Relayer job errors caused by upstream hiccups (observed on Mainnet:
 * "seal encrypt failed … RpcError: Too Many Requests"). The job produced no
 * blob, so resubmitting is safe.
 */
export function isTransientJobError(error: string | undefined): boolean {
  if (!error) return false;
  return /too many requests|\b429\b|rate.?limit|timed? ?out|timeout|temporar|unavailable|\b50[234]\b|econnreset|socket hang up/i.test(
    error,
  );
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function toRecalled(hit: RecallResult["results"][number]): RecalledMemory {
  return {
    blobId: hit.blob_id,
    text: hit.text,
    distance: hit.distance,
    ...(hit.created_at === undefined ? {} : { createdAt: hit.created_at }),
    decoded: decodeMemory(hit.text),
  };
}

export function createMemWalPort(client: MemWalLike, config: MemWalAdapterConfig): MemoryPort {
  const now = config.now ?? Date.now;
  const timeoutError = (label: string, ms: number) => new MemoryTimeoutError(label, ms);

  const fail = (raw: unknown, label: string): never => {
    const { error } = classifyMemoryError(raw, label);
    if (error.code === "MEMORY_AUTH") {
      logOnce("error", "memory.auth_error", { code: error.code, message: error.message });
    } else if (error.code === "MEMORY_COMPATIBILITY") {
      logOnce("error", "memory.compatibility_error", { message: error.message });
    }
    throw error;
  };

  return {
    driver: "memwal",

    async recall(args: RecallArgs) {
      const query = args.query.trim();
      if (query.length === 0) return [];
      const params: RecallParams = {
        query,
        namespace: args.namespace,
        limit: args.limit,
        ...(args.maxDistance === undefined ? {} : { maxDistance: args.maxDistance }),
      };
      try {
        const result = await withTimeout(
          client.recall(params),
          config.recallTimeoutMs,
          "memwal.recall",
          {
            makeError: timeoutError,
          },
        );
        return result.results.map(toRecalled);
      } catch (raw) {
        return fail(raw, "memwal.recall");
      }
    },

    async rememberMany(args: RememberManyArgs) {
      const texts = args.texts.map((t) => t.trim());
      if (texts.length === 0) return [];
      const outcomes: RememberOutcome[] = [];
      let lastAcceptError: unknown;
      const batches = chunk(
        texts.map((text, index) => ({ text, index })),
        coachLimits.bulkMax,
      );

      for (const batch of batches) {
        const started = now();
        let accepted: RememberBulkAcceptedResult;
        try {
          accepted = await withTimeout(
            client.rememberBulkAsync(
              batch.map((b) => ({ text: b.text, namespace: args.namespace })),
            ),
            config.saveTimeoutMs,
            "memwal.rememberBulk",
            { makeError: timeoutError },
          );
        } catch (raw) {
          // Nothing in this batch was accepted: record failures and move on so
          // outcomes from earlier (already accepted) batches are not lost.
          lastAcceptError = raw;
          const { error } = classifyMemoryError(raw, "memwal.rememberBulk");
          for (const b of batch) {
            outcomes.push({
              ok: false,
              index: b.index,
              jobId: null,
              errorCode: error.code,
              latencyMs: null,
            });
          }
          continue;
        }

        const jobs: AcceptedMemoryJob[] = batch.map((b, i) => ({
          index: b.index,
          jobId: accepted.job_ids[i] ?? "",
        }));
        if (args.onAccepted) {
          try {
            await args.onAccepted(jobs.filter((j) => j.jobId));
          } catch (error) {
            // Bookkeeping failure must not lose the (already paid) writes.
            log.error("memory.on_accepted_failed", { error });
          }
        }

        const jobIds = jobs.map((j) => j.jobId);
        const budget = Math.max(1000, config.saveTimeoutMs - (now() - started));
        let waited: RememberBulkResult;
        try {
          waited = await withTimeout(
            client.waitForRememberJobs(
              jobIds,
              jobIds.map(() => args.namespace),
              { timeoutMs: budget, pollIntervalMs: config.pollIntervalMs ?? 1500 },
            ),
            budget + 2000,
            "memwal.waitForRememberJobs",
            { makeError: timeoutError },
          );
        } catch (raw) {
          const { error } = classifyMemoryError(raw, "memwal.waitForRememberJobs");
          for (const job of jobs) {
            outcomes.push({
              ok: false,
              index: job.index,
              jobId: job.jobId,
              errorCode: error.code,
              latencyMs: null,
            });
          }
          continue;
        }

        const latencyMs = now() - started;
        jobs.forEach((job, i) => {
          const r = waited.results[i];
          if (r && r.status === "done" && r.blob_id) {
            outcomes.push({
              ok: true,
              index: job.index,
              jobId: job.jobId,
              blobId: r.blob_id,
              latencyMs,
            });
          } else {
            const errorCode =
              r?.status === "done"
                ? "MISSING_BLOB_ID"
                : r?.status === "timeout"
                  ? "MEMORY_TIMEOUT"
                  : r?.error === "job not found"
                    ? "JOB_NOT_FOUND"
                    : isTransientJobError(r?.error)
                      ? "JOB_FAILED_TRANSIENT"
                      : "JOB_FAILED";
            outcomes.push({
              ok: false,
              index: job.index,
              jobId: job.jobId,
              errorCode,
              latencyMs,
              ...(r?.error ? { detail: r.error.slice(0, 240) } : {}),
            });
          }
        });
      }
      // If NOTHING was accepted, surface the error so callers can retry safely
      // (no write happened, so a retry cannot duplicate a paid job).
      if (lastAcceptError !== undefined && outcomes.every((o) => !o.ok && o.jobId === null)) {
        return fail(lastAcceptError, "memwal.rememberBulk");
      }
      return outcomes.sort((a, b) => a.index - b.index);
    },

    async jobStatuses(jobIds): Promise<MemoryJobStatus[]> {
      if (jobIds.length === 0) return [];
      const out: MemoryJobStatus[] = [];
      for (const ids of chunk(jobIds, 50)) {
        let res: RememberBulkStatusResult;
        try {
          res = await withTimeout(
            client.getRememberBulkStatus([...ids], { timeoutMs: config.recallTimeoutMs }),
            config.recallTimeoutMs + 1000,
            "memwal.jobStatuses",
            { makeError: timeoutError },
          );
        } catch (raw) {
          return fail(raw, "memwal.jobStatuses");
        }
        const byId = new Map(res.results.map((r) => [r.job_id, r]));
        for (const jobId of ids) {
          const r = byId.get(jobId);
          if (!r || r.status === "not_found") out.push({ jobId, state: "unknown" });
          else if (r.status === "done" && r.blob_id)
            out.push({ jobId, state: "done", blobId: r.blob_id });
          else if (r.status === "failed")
            out.push({ jobId, state: "failed", ...(r.error ? { error: r.error } : {}) });
          else out.push({ jobId, state: "pending" });
        }
      }
      return out;
    },

    async health(): Promise<MemoryHealth> {
      try {
        const h = await withTimeout(client.health(), config.recallTimeoutMs, "memwal.health", {
          makeError: timeoutError,
        });
        const version = h.relayerVersion ?? h.version;
        return {
          ok: h.status === "ok" && h.write_ready !== false,
          ...(version ? { version } : {}),
          ...(h.write_ready === false ? { reason: "relayer not write-ready" } : {}),
        };
      } catch (raw) {
        const { error } = classifyMemoryError(raw, "memwal.health");
        return { ok: false, reason: error.code };
      }
    },
  };
}
