import { createHash, timingSafeEqual } from "node:crypto";
import { coachLimits } from "@/config/coach";
import { log } from "@/lib/log";
import type { CoachingSessionsRepo } from "@/server/db/repositories/coaching-sessions.repo";
import type { MemoryEventsRepo } from "@/server/db/repositories/memory-events.repo";
import { jsonOk } from "@/server/http/respond";
import type { MemoryPort } from "@/server/memory/memory-port";
import { reconcilePendingJobs } from "@/server/memory/reconcile";

export interface CronDeps {
  cronSecret: string;
  memory: () => MemoryPort;
  memoryEvents: MemoryEventsRepo;
  sessions: Pick<CoachingSessionsRepo, "endIdleSessions">;
  now?: () => number;
}

function authorized(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = createHash("sha256").update(header).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Daily: log relayer health + stale pending jobs, reconcile what we can, and
 * end sessions idle for more than 2 hours. Metadata only.
 */
export function createCronHealthHandler(deps: CronDeps) {
  const now = deps.now ?? Date.now;
  return async function cron(request: Request): Promise<Response> {
    if (!authorized(request, deps.cronSecret)) return new Response(null, { status: 401 });
    const memory = deps.memory();
    const health = await memory.health();
    const reconciled = await reconcilePendingJobs({
      memory,
      memoryEvents: deps.memoryEvents,
      limit: 200,
    });
    const stalePending = await deps.memoryEvents.countStalePending(new Date(now() - 10 * 60_000));
    const idleSessionsEnded = await deps.sessions.endIdleSessions({
      idleBefore: new Date(now() - coachLimits.sessionIdleMs),
      now: new Date(now()),
    });
    const summary = {
      relayerOk: health.ok,
      relayerVersion: health.version ?? null,
      reconciled,
      stalePending,
      idleSessionsEnded,
    };
    log.info("cron.health", summary);
    return jsonOk(summary);
  };
}
