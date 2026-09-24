import { log } from "@/lib/log";
import { TtlCache } from "@/lib/ttl-cache";
import { jsonOk } from "@/server/http/respond";
import type { MemoryHealth, MemoryPort } from "@/server/memory/memory-port";
import type { HealthDto } from "@/types/api";

export interface HealthDeps {
  pingDb: () => Promise<boolean>;
  memory: () => MemoryPort;
  modelId: string;
  now?: () => number;
}

/** Healthy results are reused for 15 s; failures only briefly, so a blip clears fast. */
const OK_TTL_MS = 15_000;
const DEGRADED_TTL_MS = 3_000;
/** One retry after a failed probe: cold starts (first DB connection, TLS to the relayer) are slow. */
const RETRY_DELAY_MS = 400;

async function retryOnce<T>(probe: () => Promise<T>, ok: (v: T) => boolean): Promise<T> {
  const first = await probe();
  if (ok(first)) return first;
  await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  return probe();
}

/**
 * Health for two audiences:
 * - "monitor" (`/api/health`): 200 when DB + relayer are ok, else 503 — for uptime checks.
 * - "status"  (`/api/status`): always 200 with the same body — for the UI's status badges,
 *   which render "degraded" themselves (no failed-request noise in the browser).
 * No auth, no secrets. Concurrent requests share one in-flight probe.
 */
export function createHealthHandler(deps: HealthDeps, cache = new TtlCache<HealthDto>(OK_TTL_MS)) {
  const now = deps.now ?? Date.now;
  let inFlight: Promise<HealthDto> | null = null;
  let degradedUntil = 0;
  let lastDegraded: HealthDto | null = null;

  async function probe(): Promise<HealthDto> {
    const [db, relayer] = await Promise.all([
      retryOnce(
        () => deps.pingDb(),
        (ok) => ok,
      ),
      retryOnce<MemoryHealth>(
        () => deps.memory().health(),
        (h) => h.ok,
      ),
    ]);
    const dto: HealthDto = {
      db: db ? "ok" : "down",
      relayer: relayer.ok ? "ok" : "down",
      ...(relayer.version ? { relayerVersion: relayer.version } : {}),
      ...(relayer.reason ? { relayerReason: relayer.reason } : {}),
      model: deps.modelId,
      checkedAt: new Date(now()).toISOString(),
    };
    if (dto.db !== "ok" || dto.relayer !== "ok") {
      // Say WHICH dependency failed, so a 503 in dev is diagnosable from the server log.
      log.warn("health.degraded", {
        db: dto.db,
        relayer: dto.relayer,
        relayerReason: dto.relayerReason ?? null,
      });
    }
    return dto;
  }

  async function current(): Promise<HealthDto> {
    const cached = cache.get("health");
    if (cached) return cached;
    if (lastDegraded && now() < degradedUntil) return lastDegraded;
    inFlight ??= probe().finally(() => {
      inFlight = null;
    });
    const dto = await inFlight;
    if (dto.db === "ok" && dto.relayer === "ok") {
      cache.set("health", dto);
      lastDegraded = null;
    } else {
      lastDegraded = dto;
      degradedUntil = now() + DEGRADED_TTL_MS;
    }
    return dto;
  }

  return async function health(mode: "monitor" | "status" = "monitor"): Promise<Response> {
    const dto = await current();
    const ok = dto.db === "ok" && dto.relayer === "ok";
    return jsonOk(dto, {
      status: ok || mode === "status" ? 200 : 503,
      // Never let a browser or CDN keep a degraded answer around.
      headers: { "Cache-Control": ok ? "public, max-age=15" : "no-store" },
    });
  };
}
