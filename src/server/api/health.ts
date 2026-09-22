import { TtlCache } from "@/lib/ttl-cache";
import { jsonOk } from "@/server/http/respond";
import type { MemoryPort } from "@/server/memory/memory-port";
import type { HealthDto } from "@/types/api";

export interface HealthDeps {
  pingDb: () => Promise<boolean>;
  memory: () => MemoryPort;
  modelId: string;
}

/** Public health: DB + relayer + model id. No auth, no secrets, cached 15 s. */
export function createHealthHandler(deps: HealthDeps, cache = new TtlCache<HealthDto>(15_000)) {
  return async function health(): Promise<Response> {
    let dto = cache.get("health");
    if (!dto) {
      const [db, relayer] = await Promise.all([deps.pingDb(), deps.memory().health()]);
      dto = {
        db: db ? "ok" : "down",
        relayer: relayer.ok ? "ok" : "down",
        ...(relayer.version ? { relayerVersion: relayer.version } : {}),
        ...(relayer.reason ? { relayerReason: relayer.reason } : {}),
        model: deps.modelId,
        checkedAt: new Date().toISOString(),
      };
      cache.set("health", dto);
    }
    const ok = dto.db === "ok" && dto.relayer === "ok";
    return jsonOk(dto, {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "public, max-age=15" },
    });
  };
}
