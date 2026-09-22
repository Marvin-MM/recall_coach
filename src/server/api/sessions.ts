import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { createSessionSchema, patchSessionSchema, sessionIdSchema } from "@/lib/schemas/api";
import type { UserResolver } from "@/server/auth/session";
import type { CoachingSessionsRepo } from "@/server/db/repositories/coaching-sessions.repo";
import type { MemoryEventsRepo } from "@/server/db/repositories/memory-events.repo";
import { errorResponse, jsonOk, parseJsonBody } from "@/server/http/respond";
import type { MemoryPort } from "@/server/memory/memory-port";
import { reconcilePendingJobs } from "@/server/memory/reconcile";
import type { RateLimitPolicy } from "@/server/ratelimit";
import type { SessionDetailDto, SessionDto, SessionsListDto } from "@/types/api";
import { sessionTitle, toSessionBase } from "./common";

export interface SessionsDeps {
  requireUser: UserResolver;
  rateLimit: RateLimitPolicy;
  sessions: CoachingSessionsRepo;
  memoryEvents: MemoryEventsRepo;
  memory: () => MemoryPort;
  now?: () => Date;
}

function parseId(id: string): string {
  const parsed = sessionIdSchema.safeParse(id);
  if (!parsed.success) throw new ValidationError([{ path: "id", message: "Invalid session id" }]);
  return parsed.data;
}

export function createSessionsHandlers(deps: SessionsDeps) {
  const now = deps.now ?? (() => new Date());

  return {
    async list(request: Request): Promise<Response> {
      try {
        const user = await deps.requireUser(request);
        await deps.rateLimit.enforce("api", user.id);
        const rows = await deps.sessions.listRecent(user.id, 20);
        const sessions: SessionDto[] = rows.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          endedAt: r.endedAt?.toISOString() ?? null,
        }));
        return jsonOk<SessionsListDto>({ sessions });
      } catch (error) {
        return errorResponse(error, { route: "sessions.list" });
      }
    },

    async create(request: Request): Promise<Response> {
      try {
        const user = await deps.requireUser(request);
        await deps.rateLimit.enforce("api", user.id);
        const input = await parseJsonBody(request, createSessionSchema);
        const row = await deps.sessions.createSession({
          userId: user.id,
          mode: input.mode,
          memoryEnabled: input.memoryEnabled,
          title: sessionTitle(input.mode, now()),
        });
        return jsonOk<SessionDto>({ ...toSessionBase(row), savedMemories: 0 }, { status: 201 });
      } catch (error) {
        return errorResponse(error, { route: "sessions.create" });
      }
    },

    async get(request: Request, rawId: string): Promise<Response> {
      try {
        const user = await deps.requireUser(request);
        await deps.rateLimit.enforce("api", user.id);
        const id = parseId(rawId);
        const row = await deps.sessions.getForUser({ id, userId: user.id });
        if (!row) throw new NotFoundError("Session not found.");
        let jobs = await deps.memoryEvents.countJobsForSession(user.id, id);
        if (jobs.pending > 0) {
          // Complete slow Mainnet saves while the summary is polling.
          const res = await reconcilePendingJobs({
            memory: deps.memory(),
            memoryEvents: deps.memoryEvents,
            userId: user.id,
            coachingSessionId: id,
          });
          if (res.done + res.failed > 0)
            jobs = await deps.memoryEvents.countJobsForSession(user.id, id);
        }
        return jsonOk<SessionDetailDto>({ ...toSessionBase(row), jobs });
      } catch (error) {
        return errorResponse(error, { route: "sessions.get" });
      }
    },

    async patch(request: Request, rawId: string): Promise<Response> {
      try {
        const user = await deps.requireUser(request);
        await deps.rateLimit.enforce("api", user.id);
        const id = parseId(rawId);
        const input = await parseJsonBody(request, patchSessionSchema);
        const key = { id, userId: user.id };
        const existing = await deps.sessions.getForUser(key);
        if (!existing) throw new NotFoundError("Session not found.");
        if (input.action === "end") {
          const ended = await deps.sessions.endSession(key, now());
          if (!ended) throw new NotFoundError("Session not found.");
          return jsonOk({ ...toSessionBase(ended) });
        }
        const updated = await deps.sessions.setMemoryEnabled(key, input.enabled);
        if (!updated) {
          throw new ConflictError(
            "Memory can only be toggled before the first message of an open session.",
          );
        }
        return jsonOk({ ...toSessionBase(updated) });
      } catch (error) {
        return errorResponse(error, { route: "sessions.patch" });
      }
    },
  };
}
