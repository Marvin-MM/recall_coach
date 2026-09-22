import { RECALL_QUERIES } from "@/config/coach";
import { TtlCache } from "@/lib/ttl-cache";
import type { UserResolver } from "@/server/auth/session";
import type { MemoryEventsRepo } from "@/server/db/repositories/memory-events.repo";
import type { UserSettingsRepo } from "@/server/db/repositories/user-settings.repo";
import { errorResponse, jsonOk } from "@/server/http/respond";
import type { MemoryPort } from "@/server/memory/memory-port";
import { deriveNamespaces } from "@/server/memory/namespace";
import { selectLatestProfile } from "@/server/memory/profile";
import type { RateLimitPolicy } from "@/server/ratelimit";
import type { MemoryInspectorDto } from "@/types/api";
import type { MemoryKind } from "@/types/domain";
import type { MemoryView, RecalledMemory } from "@/types/memory";

export interface MemoryInspectorDeps {
  requireUser: UserResolver;
  rateLimit: RateLimitPolicy;
  userSettings: UserSettingsRepo;
  memoryEvents: MemoryEventsRepo;
  memory: () => MemoryPort;
  namespacePrefix: string;
  explorerBlobUrl: string;
  cache?: TtlCache<MemoryInspectorDto>;
}

const PER_QUERY_LIMIT = 20;

export function toMemoryView(m: RecalledMemory, explorerBlobUrl: string): MemoryView {
  return {
    blobId: m.blobId,
    kind: m.decoded?.kind ?? "note",
    text: m.decoded?.kind === "profile" ? "Profile snapshot" : (m.decoded?.body ?? m.text),
    at: m.decoded?.at ?? m.createdAt ?? null,
    explorerUrl: `${explorerBlobUrl}${encodeURIComponent(m.blobId)}`,
  };
}

/**
 * "What I remember": live recall from Walrus across both namespaces with a
 * few broad queries, merged + deduped by blob id, grouped by kind, newest
 * first. Cached per user for 30 s.
 */
export function createMemoryInspectorHandler(deps: MemoryInspectorDeps) {
  const cache = deps.cache ?? new TtlCache<MemoryInspectorDto>(30_000);
  return async function inspect(request: Request): Promise<Response> {
    try {
      const user = await deps.requireUser(request);
      await deps.rateLimit.enforce("api", user.id);
      const refresh = new URL(request.url).searchParams.get("refresh") === "1";
      const cached = refresh ? undefined : cache.get(user.id);
      if (cached) return jsonOk(cached);

      const settings = await deps.userSettings.get(user.id);
      const ns = deriveNamespaces(user.id, settings?.namespaceVersion ?? 1, deps.namespacePrefix);
      const memory = deps.memory();
      const queries = [
        ...RECALL_QUERIES.inspector.map((query) => ({ namespace: ns.facts, query })),
        { namespace: ns.profile, query: RECALL_QUERIES.profile },
      ];
      // Two at a time: parallel recalls on one account slow each other down.
      const results: PromiseSettledResult<RecalledMemory[]>[] = [];
      for (let i = 0; i < queries.length; i += 2) {
        results.push(
          ...(await Promise.allSettled(
            queries.slice(i, i + 2).map((q) => memory.recall({ ...q, limit: PER_QUERY_LIMIT })),
          )),
        );
      }
      const hits = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
      const degraded = results.every((r) => r.status === "rejected");

      const byBlob = new Map<string, RecalledMemory>();
      for (const h of hits) if (h.blobId && !byBlob.has(h.blobId)) byBlob.set(h.blobId, h);
      const unique = [...byBlob.values()];
      const profile = selectLatestProfile(unique);

      const groups: Partial<Record<MemoryKind | "note", MemoryView[]>> = {};
      for (const m of unique) {
        if (m.decoded?.kind === "profile") continue;
        const view = toMemoryView(m, deps.explorerBlobUrl);
        const list = groups[view.kind] ?? [];
        list.push(view);
        groups[view.kind] = list;
      }
      for (const list of Object.values(groups)) {
        list?.sort((a, b) => Date.parse(b.at ?? "0") - Date.parse(a.at ?? "0"));
      }

      const dto: MemoryInspectorDto = {
        profile: profile?.profile ?? null,
        profileAt: profile?.at ?? null,
        groups,
        totals: {
          doneBlobs: await deps.memoryEvents.countDoneBlobsByUser(user.id),
          recalled: unique.length,
        },
        degraded,
        fetchedAt: new Date().toISOString(),
      };
      if (!degraded) cache.set(user.id, dto);
      return jsonOk(dto);
    } catch (error) {
      return errorResponse(error, { route: "memory" });
    }
  };
}
