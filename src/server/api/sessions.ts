import { coachLimits, RECALL_QUERIES } from "@/config/coach";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { createSessionSchema, patchSessionSchema, sessionIdSchema } from "@/lib/schemas/api";
import type { UserResolver } from "@/server/auth/session";
import type { CoachingSessionsRepo } from "@/server/db/repositories/coaching-sessions.repo";
import type { MemoryEventsRepo } from "@/server/db/repositories/memory-events.repo";
import type { UserSettingsRepo } from "@/server/db/repositories/user-settings.repo";
import { errorResponse, jsonOk, parseJsonBody } from "@/server/http/respond";
import type { MemoryPort } from "@/server/memory/memory-port";
import { deriveNamespaces } from "@/server/memory/namespace";
import { reconcilePendingJobs } from "@/server/memory/reconcile";
import type { RateLimitPolicy } from "@/server/ratelimit";
import type { TranscriptStore } from "@/server/transcripts/transcript-store";
import type {
  ActiveSessionDto,
  DeletedDto,
  PreviousSavesDto,
  SessionDetailDto,
  SessionDto,
  SessionMemoriesDto,
  SessionMemoryItemDto,
  SessionMessagesDto,
  SessionsListDto,
} from "@/types/api";
import type { CoachProfile, RecalledMemory } from "@/types/memory";
import { sessionTitle, toSessionBase } from "./common";

export interface SessionsDeps {
  requireUser: UserResolver;
  rateLimit: RateLimitPolicy;
  sessions: CoachingSessionsRepo;
  memoryEvents: MemoryEventsRepo;
  userSettings: UserSettingsRepo;
  transcripts: TranscriptStore;
  memory: () => MemoryPort;
  namespacePrefix: string;
  explorerBlobUrl: string;
  now?: () => Date;
}

function parseId(id: string): string {
  const parsed = sessionIdSchema.safeParse(id);
  if (!parsed.success) throw new ValidationError([{ path: "id", message: "Invalid session id" }]);
  return parsed.data;
}

/** One line for a profile snapshot, from its own fields (never free text from chat). */
export function profileSummary(profile: CoachProfile | undefined): string {
  if (!profile) return "Profile snapshot";
  const role = [profile.targetRole, profile.company && `at ${profile.company}`]
    .filter(Boolean)
    .join(" ");
  const parts = [
    role && `Preparing for ${role}`,
    profile.level && `${profile.level} level`,
    profile.interviewDate && `interview on ${profile.interviewDate}`,
    profile.learningStyle && `learns best: ${profile.learningStyle}`,
  ].filter(Boolean);
  return parts.length > 0 ? `Profile updated: ${parts.join(" · ")}` : "Profile snapshot";
}

export function createSessionsHandlers(deps: SessionsDeps) {
  const now = deps.now ?? (() => new Date());
  const idleBefore = () => new Date(now().getTime() - coachLimits.sessionIdleMs);

  async function ownedSession(userId: string, rawId: string) {
    const id = parseId(rawId);
    const row = await deps.sessions.getForUser({ id, userId });
    // 404 (not 403) for other users' sessions: no enumeration.
    if (!row) throw new NotFoundError("Session not found.");
    return row;
  }

  return {
    async list(request: Request): Promise<Response> {
      try {
        const user = await deps.requireUser(request);
        await deps.rateLimit.enforce("api", user.id);
        // Lazy auto-end: nothing idle for > 2 h shows as open.
        await deps.sessions.endIdleSessions({
          userId: user.id,
          idleBefore: idleBefore(),
          now: now(),
        });
        const rows = await deps.sessions.listRecent(user.id, 30);
        const sessions: SessionDto[] = rows.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          lastActivityAt: r.lastActivityAt.toISOString(),
          endedAt: r.endedAt?.toISOString() ?? null,
        }));
        return jsonOk<SessionsListDto>({ sessions });
      } catch (error) {
        return errorResponse(error, { route: "sessions.list" });
      }
    },

    async active(request: Request): Promise<Response> {
      try {
        const user = await deps.requireUser(request);
        await deps.rateLimit.enforce("api", user.id);
        const cutoff = idleBefore();
        await deps.sessions.endIdleSessions({ userId: user.id, idleBefore: cutoff, now: now() });
        const row = await deps.sessions.findActive(user.id, cutoff);
        return jsonOk<ActiveSessionDto>({ session: row ? toSessionBase(row) : null });
      } catch (error) {
        return errorResponse(error, { route: "sessions.active" });
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
        const row = await ownedSession(user.id, rawId);
        let jobs = await deps.memoryEvents.countJobsForSession(user.id, row.id);
        if (jobs.pending > 0) {
          // Complete slow Mainnet saves while the summary is polling.
          const res = await reconcilePendingJobs({
            memory: deps.memory(),
            memoryEvents: deps.memoryEvents,
            userId: user.id,
            coachingSessionId: row.id,
          });
          if (res.done + res.failed > 0)
            jobs = await deps.memoryEvents.countJobsForSession(user.id, row.id);
        }
        return jsonOk<SessionDetailDto>({ ...toSessionBase(row), jobs });
      } catch (error) {
        return errorResponse(error, { route: "sessions.get" });
      }
    },

    /**
     * Are an earlier session's memories still saving to Walrus? Completes
     * what it can (like the summary poll) and returns the live pending count.
     * Metadata only — never memory text.
     */
    async previousSaves(request: Request, rawId: string): Promise<Response> {
      try {
        const user = await deps.requireUser(request);
        await deps.rateLimit.enforce("api", user.id);
        const current = await ownedSession(user.id, rawId);
        const previous = await deps.memoryEvents.pendingFromOtherSession(user.id, current.id);
        if (!previous) return jsonOk<PreviousSavesDto>({ sessionId: null, pending: 0 });
        let pending = previous.pending;
        const res = await reconcilePendingJobs({
          memory: deps.memory(),
          memoryEvents: deps.memoryEvents,
          userId: user.id,
          coachingSessionId: previous.coachingSessionId,
        });
        if (res.done + res.failed > 0) {
          const jobs = await deps.memoryEvents.countJobsForSession(
            user.id,
            previous.coachingSessionId,
          );
          pending = jobs.pending;
        }
        return jsonOk<PreviousSavesDto>({ sessionId: previous.coachingSessionId, pending });
      } catch (error) {
        return errorResponse(error, { route: "sessions.previous_saves" });
      }
    },

    async patch(request: Request, rawId: string): Promise<Response> {
      try {
        const user = await deps.requireUser(request);
        await deps.rateLimit.enforce("api", user.id);
        const input = await parseJsonBody(request, patchSessionSchema);
        const existing = await ownedSession(user.id, rawId);
        const key = { id: existing.id, userId: user.id };
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

    /** The user's own decrypted transcript for one session (read-only once ended). */
    async messages(request: Request, rawId: string): Promise<Response> {
      try {
        const user = await deps.requireUser(request);
        await deps.rateLimit.enforce("api", user.id);
        const row = await ownedSession(user.id, rawId);
        const { messages, nextSeq } = await deps.transcripts.listForSession({
          userId: user.id,
          sessionId: row.id,
        });
        return jsonOk<SessionMessagesDto>({
          sessionId: row.id,
          messages: messages.map((m) => ({
            seq: m.seq,
            role: m.role,
            text: m.status === "ok" ? m.text : "",
            status: m.status,
            createdAt: m.createdAt.toISOString(),
          })),
          nextSeq,
          ended: row.endedAt !== null,
        });
      } catch (error) {
        return errorResponse(error, { route: "sessions.messages" });
      }
    },

    /** Deletes one session's transcript. Walrus memories are NOT affected. */
    async deleteMessages(request: Request, rawId: string): Promise<Response> {
      try {
        const user = await deps.requireUser(request);
        await deps.rateLimit.enforce("api", user.id);
        const row = await ownedSession(user.id, rawId);
        const deleted = await deps.transcripts.deleteForSession({
          userId: user.id,
          sessionId: row.id,
        });
        return jsonOk<DeletedDto>({ deleted });
      } catch (error) {
        return errorResponse(error, { route: "sessions.messages.delete" });
      }
    },

    /**
     * "What your coach kept from this session": the session's memory rows
     * (kind, status, blob id) plus their text, recalled live from the user's
     * facts and profile namespaces with broad queries and matched to this
     * session by blob id or the `session=<id>` header.
     */
    async memories(request: Request, rawId: string): Promise<Response> {
      try {
        const user = await deps.requireUser(request);
        await deps.rateLimit.enforce("api", user.id);
        const row = await ownedSession(user.id, rawId);
        const empty: SessionMemoriesDto = {
          items: [],
          retrieved: 0,
          expected: 0,
          memoryEnabled: row.memoryEnabled,
          degraded: false,
        };
        if (!row.memoryEnabled) return jsonOk(empty);

        let events = await deps.memoryEvents.listForSession(user.id, row.id);
        if (events.some((e) => e.status === "pending")) {
          await reconcilePendingJobs({
            memory: deps.memory(),
            memoryEvents: deps.memoryEvents,
            userId: user.id,
            coachingSessionId: row.id,
          });
          events = await deps.memoryEvents.listForSession(user.id, row.id);
        }
        const doneBlobs = new Set(
          events.flatMap((e) => (e.status === "done" && e.blobId ? [e.blobId] : [])),
        );
        if (events.length === 0) return jsonOk(empty);

        const settings = await deps.userSettings.get(user.id);
        const ns = deriveNamespaces(user.id, settings?.namespaceVersion ?? 1, deps.namespacePrefix);
        const limit = coachLimits.sessionMemoriesLimit;
        const queries = [
          ...RECALL_QUERIES.inspector.map((query) => ({ namespace: ns.facts, query })),
          { namespace: ns.facts, query: RECALL_QUERIES.recap },
          { namespace: ns.profile, query: RECALL_QUERIES.profile },
        ];
        const memory = deps.memory();
        const settled: PromiseSettledResult<RecalledMemory[]>[] = [];
        if (doneBlobs.size > 0) {
          // Two at a time: parallel recalls on one account slow each other down.
          for (let i = 0; i < queries.length; i += 2) {
            settled.push(
              ...(await Promise.allSettled(
                queries.slice(i, i + 2).map((q) => memory.recall({ ...q, limit })),
              )),
            );
          }
        }
        const hits = new Map<string, RecalledMemory>();
        for (const r of settled) {
          if (r.status !== "fulfilled") continue;
          for (const m of r.value) {
            if (!m.blobId || hits.has(m.blobId)) continue;
            if (doneBlobs.has(m.blobId) || m.decoded?.sessionId === row.id) hits.set(m.blobId, m);
          }
        }

        const textOf = (m: RecalledMemory) =>
          m.decoded?.kind === "profile"
            ? profileSummary(m.decoded.profile)
            : (m.decoded?.body ?? m.text);
        const explorer = (blobId: string) => `${deps.explorerBlobUrl}${encodeURIComponent(blobId)}`;

        const items: SessionMemoryItemDto[] = events.map((e) => {
          const hit = e.blobId ? hits.get(e.blobId) : undefined;
          return {
            kind: e.kind,
            status: e.status,
            blobId: e.blobId,
            explorerUrl: e.blobId ? explorer(e.blobId) : null,
            text: hit ? textOf(hit) : null,
            at: hit?.decoded?.at ?? e.completedAt?.toISOString() ?? e.createdAt.toISOString(),
          };
        });
        // Lines tagged with this session that our bookkeeping doesn't list (e.g. rows deleted).
        const listed = new Set(events.map((e) => e.blobId));
        for (const m of hits.values()) {
          if (listed.has(m.blobId) || !m.decoded) continue;
          items.push({
            kind: m.decoded.kind,
            status: "done",
            blobId: m.blobId,
            explorerUrl: explorer(m.blobId),
            text: textOf(m),
            at: m.decoded.at,
          });
        }

        return jsonOk<SessionMemoriesDto>({
          items,
          retrieved: items.filter((i) => i.status === "done" && i.text !== null).length,
          expected: Math.max(doneBlobs.size, items.filter((i) => i.status === "done").length),
          memoryEnabled: true,
          degraded: settled.length > 0 && settled.every((r) => r.status === "rejected"),
        });
      } catch (error) {
        return errorResponse(error, { route: "sessions.memories" });
      }
    },
  };
}
