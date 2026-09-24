import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "@/lib/errors";
import { TtlCache } from "@/lib/ttl-cache";
import { createEvidenceHandler } from "@/server/api/evidence";
import { createHealthHandler } from "@/server/api/health";
import { createMeHandler } from "@/server/api/me";
import { createMemoryInspectorHandler } from "@/server/api/memory-inspector";
import { createOnboardingHandler } from "@/server/api/onboarding";
import { createSessionsHandlers } from "@/server/api/sessions";
import { createSettingsHandlers } from "@/server/api/settings";
import type { AuthUser } from "@/server/auth/session";
import { createCoachingSessionsRepo } from "@/server/db/repositories/coaching-sessions.repo";
import { createEvidenceRepo } from "@/server/db/repositories/evidence.repo";
import { createMemoryEventsRepo } from "@/server/db/repositories/memory-events.repo";
import { createUserSettingsRepo } from "@/server/db/repositories/user-settings.repo";
import * as schema from "@/server/db/schema";
import { createFakeMemory, type FakeMemoryPort } from "@/server/memory/fake-memory";
import { decodeMemory, encodeFact, encodeProfile } from "@/server/memory/memory-format";
import { deriveNamespaces } from "@/server/memory/namespace";
import { createTranscriptStore } from "@/server/transcripts/transcript-store";
import type {
  ActiveSessionDto,
  MemoryInspectorDto,
  SessionDetailDto,
  SessionDto,
  SessionMemoriesDto,
  SessionMessagesDto,
} from "@/types/api";
import type { RecalledMemory } from "@/types/memory";
import { createTestDb, insertUser, type TestDb } from "../support/pglite";
import { testKeyring } from "../support/transcripts";

let t: TestDb;
let alice: AuthUser;
let bob: AuthUser;
let memory: FakeMemoryPort;
const PREFIX = "coach-test-v1";

beforeAll(async () => {
  t = await createTestDb();
}, 60_000);
afterAll(async () => t.close());
beforeEach(async () => {
  await t.reset();
  const a = await insertUser(t.db, { email: "alice@example.test", name: "Alice Example" });
  const b = await insertUser(t.db, { email: "bob@example.test", name: "Bob" });
  alice = { id: a.id, email: a.email, name: a.name, image: null };
  bob = { id: b.id, email: b.email, name: b.name, image: null };
  memory = createFakeMemory();
});

const as = (user: AuthUser | null) => async () => {
  if (!user) throw new UnauthorizedError();
  return user;
};
const noLimit = { enforce: vi.fn(async () => {}) };
const req = (url: string, init?: RequestInit) => new Request(`http://localhost${url}`, init);
const json = (body: unknown, method = "POST") => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

function sessionsApi(user: AuthUser | null, now = () => new Date("2026-09-22T08:00:00Z")) {
  return createSessionsHandlers({
    requireUser: as(user),
    rateLimit: noLimit,
    sessions: createCoachingSessionsRepo(t.db),
    memoryEvents: createMemoryEventsRepo(t.db),
    userSettings: createUserSettingsRepo(t.db),
    transcripts: createTranscriptStore(t.db, testKeyring),
    memory: () => memory,
    namespacePrefix: PREFIX,
    explorerBlobUrl: "https://walruscan.test/blob/",
    now,
  });
}

const store = () => createTranscriptStore(t.db, testKeyring);

async function sessionWithTranscript(user: AuthUser, memoryEnabled = true) {
  const s = await createCoachingSessionsRepo(t.db).createSession({
    userId: user.id,
    mode: "mock_interview",
    memoryEnabled,
    title: "Mock interview · 22 Sep",
  });
  const now = new Date();
  const turn = await store().beginTurn({
    userId: user.id,
    sessionId: s.id,
    text: "Tell me what to practise",
    expectedSeq: 0,
    now,
  });
  await store().appendAssistant({
    userId: user.id,
    sessionId: s.id,
    seq: (turn.userSeq ?? 0) + 1,
    text: "**Let's start** with a STAR question.",
    status: "ok",
    now,
  });
  await store().beginTurn({
    userId: user.id,
    sessionId: s.id,
    text: "Second try",
    expectedSeq: 2,
    now,
  });
  await store().appendAssistant({
    userId: user.id,
    sessionId: s.id,
    seq: 3,
    text: "",
    status: "failed",
    now,
  });
  return s;
}

describe("sessions API", () => {
  it("creates with a generic title and lists newest first", async () => {
    const api = sessionsApi(alice);
    const res = await api.create(req("/api/sessions", json({ mode: "mock_interview" })));
    expect(res.status).toBe(201);
    const created = (await res.json()) as SessionDto;
    expect(created).toMatchObject({
      title: "Mock interview · 22 Sep",
      memoryEnabled: true,
      turnCount: 0,
    });
    await api.create(req("/api/sessions", json({ mode: "drill", memoryEnabled: false })));
    const list = (await (await api.list(req("/api/sessions"))).json()) as {
      sessions: SessionDto[];
    };
    expect(list.sessions.map((s) => s.mode)).toEqual(["drill", "mock_interview"]);
  });

  it("rejects bad input with issue paths", async () => {
    const res = await sessionsApi(alice).create(req("/api/sessions", json({ mode: "karaoke" })));
    expect(res.status).toBe(400);
    expect(
      ((await res.json()) as { error: { issues: { path: string }[] } }).error.issues[0]?.path,
    ).toBe("mode");
  });

  it("returns 404 for another user's session (GET and PATCH) and for bad ids", async () => {
    const created = (await (
      await sessionsApi(alice).create(req("/api/sessions", json({ mode: "drill" })))
    ).json()) as SessionDto;
    expect(
      (await sessionsApi(bob).get(req(`/api/sessions/${created.id}`), created.id)).status,
    ).toBe(404);
    expect(
      (
        await sessionsApi(bob).patch(
          req(`/api/sessions/${created.id}`, json({ action: "end" }, "PATCH")),
          created.id,
        )
      ).status,
    ).toBe(404);
    expect((await sessionsApi(alice).get(req("/api/sessions/x"), "not-a-uuid")).status).toBe(400);
  });

  it("toggles memory only before the first turn; ending is idempotent", async () => {
    const api = sessionsApi(alice);
    const s = (await (
      await api.create(req("/api/sessions", json({ mode: "drill" })))
    ).json()) as SessionDto;
    const off = await api.patch(
      req("/x", json({ action: "setMemory", enabled: false }, "PATCH")),
      s.id,
    );
    expect(((await off.json()) as SessionDto).memoryEnabled).toBe(false);
    await createCoachingSessionsRepo(t.db).incrementTurn({ id: s.id, userId: alice.id });
    const late = await api.patch(
      req("/x", json({ action: "setMemory", enabled: true }, "PATCH")),
      s.id,
    );
    expect(late.status).toBe(409);
    expect((await api.patch(req("/x", json({ action: "end" }, "PATCH")), s.id)).status).toBe(200);
    expect((await api.patch(req("/x", json({ action: "end" }, "PATCH")), s.id)).status).toBe(200);
  });

  it("GET reconciles pending jobs for the summary", async () => {
    const api = sessionsApi(alice);
    const s = (await (
      await api.create(req("/api/sessions", json({ mode: "drill" })))
    ).json()) as SessionDto;
    const [outcome] = await memory.rememberMany({ namespace: "n", texts: ["x fact"] });
    await createMemoryEventsRepo(t.db).recordAcceptedJobs([
      {
        userId: alice.id,
        coachingSessionId: s.id,
        namespace: "n",
        kind: "goal",
        jobId: outcome?.jobId ?? "",
      },
    ]);
    await t.db.update(schema.memoryEvents).set({ createdAt: new Date(Date.now() - 60_000) });
    const detail = (await (
      await api.get(req(`/api/sessions/${s.id}`), s.id)
    ).json()) as SessionDetailDto;
    expect(detail.jobs).toEqual({ pending: 0, done: 1, failed: 0 });
  });

  it("401 without a session", async () => {
    expect((await sessionsApi(null).list(req("/api/sessions"))).status).toBe(401);
  });
});

describe("session history API", () => {
  it("GET messages: owner only (404 otherwise), decrypted, ordered, failed rows flagged, nextSeq", async () => {
    const s = await sessionWithTranscript(alice);
    const res = await sessionsApi(alice).messages(req(`/api/sessions/${s.id}/messages`), s.id);
    expect(res.status).toBe(200);
    const body = (await res.json()) as SessionMessagesDto;
    expect(body.nextSeq).toBe(4);
    expect(body.ended).toBe(false);
    expect(body.messages.map((m) => [m.seq, m.role, m.status, m.text])).toEqual([
      [0, "user", "ok", "Tell me what to practise"],
      [1, "assistant", "ok", "**Let's start** with a STAR question."],
      [2, "user", "ok", "Second try"],
      [3, "assistant", "failed", ""],
    ]);
    expect((await sessionsApi(bob).messages(req("/x"), s.id)).status).toBe(404);
    expect((await sessionsApi(alice).messages(req("/x"), "not-a-uuid")).status).toBe(400);
    expect((await sessionsApi(null).messages(req("/x"), s.id)).status).toBe(401);
  });

  it("a row tampered with in the database is reported as unreadable, not shown", async () => {
    const s = await sessionWithTranscript(alice);
    await t.db
      .update(schema.sessionMessages)
      .set({ ciphertext: new Uint8Array([1, 2, 3, 4]) })
      .where(eq(schema.sessionMessages.seq, 0));
    const body = (await (
      await sessionsApi(alice).messages(req("/x"), s.id)
    ).json()) as SessionMessagesDto;
    expect(body.messages[0]).toMatchObject({ status: "unreadable", text: "" });
    expect(body.messages[1]?.status).toBe("ok");
  });

  it("DELETE messages and DELETE /api/me/transcripts remove transcripts but never memories", async () => {
    const s1 = await sessionWithTranscript(alice);
    const s2 = await sessionWithTranscript(alice);
    const bobs = await sessionWithTranscript(bob);
    await createMemoryEventsRepo(t.db).recordAcceptedJobs([
      { userId: alice.id, coachingSessionId: s1.id, namespace: "n", kind: "goal", jobId: "job-1" },
    ]);

    expect((await sessionsApi(bob).deleteMessages(req("/x"), s1.id)).status).toBe(404);
    const one = await sessionsApi(alice).deleteMessages(req("/x", { method: "DELETE" }), s1.id);
    expect(await one.json()).toEqual({ deleted: 4 });
    expect((await store().listForSession({ userId: alice.id, sessionId: s1.id })).messages).toEqual(
      [],
    );

    const settings = createSettingsHandlers({
      requireUser: as(alice),
      rateLimit: noLimit,
      userSettings: createUserSettingsRepo(t.db),
      transcripts: store(),
    });
    const all = await settings.deleteAllTranscripts(
      req("/api/me/transcripts", { method: "DELETE" }),
    );
    expect(await all.json()).toEqual({ deleted: 4 });
    expect((await store().listForSession({ userId: alice.id, sessionId: s2.id })).messages).toEqual(
      [],
    );
    // Other users' transcripts and all memory metadata are untouched.
    expect(
      (await store().listForSession({ userId: bob.id, sessionId: bobs.id })).messages,
    ).toHaveLength(4);
    expect(await t.db.select().from(schema.memoryEvents)).toHaveLength(1);
  });

  it("PATCH /api/me/settings toggles saveTranscripts (strict body); /api/me reports it", async () => {
    const settings = createSettingsHandlers({
      requireUser: as(alice),
      rateLimit: noLimit,
      userSettings: createUserSettingsRepo(t.db),
      transcripts: store(),
    });
    const off = await settings.patch(
      req("/api/me/settings", json({ saveTranscripts: false }, "PATCH")),
    );
    expect(await off.json()).toEqual({ saveTranscripts: false });
    expect((await settings.patch(req("/x", json({ saveTranscripts: "no" }, "PATCH")))).status).toBe(
      400,
    );
    expect(
      (await settings.patch(req("/x", json({ saveTranscripts: true, admin: true }, "PATCH"))))
        .status,
    ).toBe(400);
    const me = createMeHandler({
      getOptionalUser: async () => alice,
      userSettings: createUserSettingsRepo(t.db),
      memoryEvents: createMemoryEventsRepo(t.db),
      adminEmails: [],
    });
    expect(await (await me(req("/api/me"))).json()).toMatchObject({ saveTranscripts: false });
    expect(
      (
        await createSettingsHandlers({
          requireUser: as(null),
          rateLimit: noLimit,
          userSettings: createUserSettingsRepo(t.db),
          transcripts: store(),
        }).patch(req("/x", json({ saveTranscripts: true }, "PATCH")))
      ).status,
    ).toBe(401);
  });

  it("GET active returns the latest open session active in the last 2 hours; idle ones are ended", async () => {
    const recent = await sessionWithTranscript(alice);
    const stale = await createCoachingSessionsRepo(t.db).createSession({
      userId: alice.id,
      mode: "drill",
      memoryEnabled: true,
      title: "Drill · 22 Sep",
    });
    await t.db
      .update(schema.coachingSessions)
      .set({ lastActivityAt: new Date(Date.now() - 3 * 60 * 60 * 1000) })
      .where(eq(schema.coachingSessions.id, stale.id));

    const realNow = () => new Date();
    const res = (await (
      await sessionsApi(alice, realNow).active(req("/api/sessions/active"))
    ).json()) as ActiveSessionDto;
    expect(res.session?.id).toBe(recent.id);
    const [staleRow] = await t.db
      .select()
      .from(schema.coachingSessions)
      .where(eq(schema.coachingSessions.id, stale.id));
    expect(staleRow?.endedAt).toBeInstanceOf(Date);

    // Two hours later, the recent one is idle too: auto-ended on list load, so nothing is active.
    const later = () => new Date(Date.now() + 2 * 60 * 60 * 1000 + 60_000);
    const list = (await (await sessionsApi(alice, later).list(req("/api/sessions"))).json()) as {
      sessions: SessionDto[];
    };
    expect(list.sessions.every((s) => s.endedAt !== null)).toBe(true);
    expect(
      ((await (await sessionsApi(alice, later).active(req("/x"))).json()) as ActiveSessionDto)
        .session,
    ).toBeNull();
    // Another user's sessions are never returned.
    expect(
      ((await (await sessionsApi(bob, realNow).active(req("/x"))).json()) as ActiveSessionDto)
        .session,
    ).toBeNull();
  });

  it("the daily cron ends idle sessions for every user", async () => {
    const { createCronHealthHandler } = await import("@/server/api/cron");
    const a = await sessionWithTranscript(alice);
    const b = await sessionWithTranscript(bob);
    await t.db
      .update(schema.coachingSessions)
      .set({ lastActivityAt: new Date(Date.now() - 3 * 60 * 60 * 1000) });
    const cron = createCronHealthHandler({
      cronSecret: "cron-secret-for-tests",
      memory: () => memory,
      memoryEvents: createMemoryEventsRepo(t.db),
      sessions: createCoachingSessionsRepo(t.db),
    });
    const res = await cron(
      req("/api/cron/health", { headers: { authorization: "Bearer cron-secret-for-tests" } }),
    );
    expect(await res.json()).toMatchObject({ idleSessionsEnded: 2 });
    const rows = await t.db.select().from(schema.coachingSessions);
    expect(rows.filter((r) => [a.id, b.id].includes(r.id)).every((r) => r.endedAt)).toBe(true);
  });

  it("GET memories: this session's rows with texts recalled from Walrus, 'X of Y' when recall misses one", async () => {
    const s = await sessionWithTranscript(alice);
    const other = await sessionWithTranscript(alice);
    const ns = deriveNamespaces(alice.id, 1, PREFIX);
    const at = new Date("2026-09-22T10:00:00Z");
    const mistake = encodeFact({
      kind: "mistake",
      text: "The user skipped the Result in a STAR answer.",
      at,
      sessionId: s.id,
    });
    const goal = encodeFact({
      kind: "goal",
      text: "The user wants to practise system design next.",
      at,
      sessionId: s.id,
    });
    const elsewhere = encodeFact({
      kind: "strength",
      text: "The user explained trade-offs clearly.",
      at,
      sessionId: other.id,
    });
    const profile = encodeProfile({
      profile: { targetRole: "Backend Engineer", company: "Stripe" },
      at,
    });
    const facts = await memory.rememberMany({
      namespace: ns.facts,
      texts: [mistake, goal, elsewhere],
    });
    const prof = await memory.rememberMany({ namespace: ns.profile, texts: [profile] });
    const events = createMemoryEventsRepo(t.db);
    const rows = [
      { o: facts[0], kind: "mistake" as const, session: s.id, namespace: ns.facts },
      { o: facts[1], kind: "goal" as const, session: s.id, namespace: ns.facts },
      { o: facts[2], kind: "strength" as const, session: other.id, namespace: ns.facts },
      { o: prof[0], kind: "profile" as const, session: s.id, namespace: ns.profile },
    ];
    await events.recordAcceptedJobs(
      rows.map((r) => ({
        userId: alice.id,
        coachingSessionId: r.session,
        namespace: r.namespace,
        kind: r.kind,
        jobId: r.o?.jobId ?? "",
      })),
    );
    await events.markJobsDone(
      rows.map((r) => ({
        jobId: r.o?.jobId ?? "",
        blobId: r.o?.ok ? r.o.blobId : "",
        latencyMs: 1,
      })),
    );
    // A fourth memory for this session whose blob recall doesn't return (e.g. dropped).
    await events.recordAcceptedJobs([
      {
        userId: alice.id,
        coachingSessionId: s.id,
        namespace: ns.facts,
        kind: "strength",
        jobId: "lost-job",
      },
    ]);
    await events.markJobsDone([{ jobId: "lost-job", blobId: "blob-not-recalled", latencyMs: 1 }]);

    const res = await sessionsApi(alice).memories(req(`/api/sessions/${s.id}/memories`), s.id);
    const body = (await res.json()) as SessionMemoriesDto;
    expect(body).toMatchObject({ memoryEnabled: true, expected: 4, retrieved: 3, degraded: false });
    const texts = body.items.map((i) => i.text);
    expect(texts).toContain("The user skipped the Result in a STAR answer.");
    expect(texts).toContain("The user wants to practise system design next.");
    expect(texts).toContain("Profile updated: Preparing for Backend Engineer at Stripe");
    expect(texts).not.toContain("The user explained trade-offs clearly.");
    expect(body.items.find((i) => i.blobId === "blob-not-recalled")?.text).toBeNull();
    expect(body.items.every((i) => i.explorerUrl?.startsWith("https://walruscan.test/blob/"))).toBe(
      true,
    );
    expect(memory.calls.recall.every((c) => c.limit <= 50)).toBe(true);
    expect((await sessionsApi(bob).memories(req("/x"), s.id)).status).toBe(404);
  });

  it("GET memories for an Amnesia session: nothing saved, no recall", async () => {
    const s = await sessionWithTranscript(alice, false);
    const before = memory.calls.recall.length;
    const body = (await (
      await sessionsApi(alice).memories(req("/x"), s.id)
    ).json()) as SessionMemoriesDto;
    expect(body).toEqual({
      items: [],
      retrieved: 0,
      expected: 0,
      memoryEnabled: false,
      degraded: false,
    });
    expect(memory.calls.recall.length).toBe(before);
  });
});

describe("onboarding API", () => {
  it("records consent, schedules the Walrus writes and caches the profile provisionally", async () => {
    const tasks: (() => Promise<void>)[] = [];
    const cache = new TtlCache<RecalledMemory>(60_000);
    const onboard = createOnboardingHandler({
      requireUser: as(alice),
      rateLimit: noLimit,
      userSettings: createUserSettingsRepo(t.db),
      memoryEvents: createMemoryEventsRepo(t.db),
      memory: () => memory,
      extract: vi.fn(),
      after: (task) => {
        tasks.push(task);
      },
      namespacePrefix: PREFIX,
      profileCache: cache,
    });
    const res = await onboard(
      req(
        "/api/onboarding",
        json({
          targetRole: "Backend Engineer",
          company: "Stripe",
          level: "mid",
          interviewDate: "2026-10-15",
          learningStyle: { format: "examples-first", verbosity: "concise" },
          focusAreas: ["system design failure modes", "STAR results"],
          consent: true,
        }),
      ),
    );
    expect(await res.json()).toEqual({ ok: true, savedJobs: 3 });
    const ns = deriveNamespaces(alice.id, 1, PREFIX);
    expect(cache.get(ns.profile)?.blobId).toBe("");
    for (const task of tasks) await task();
    const rows = await t.db.select().from(schema.memoryEvents);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.status === "done")).toBe(true);
    expect(decodeMemory(memory.store.get(ns.profile)?.[0]?.text ?? "")?.profile).toMatchObject({
      targetRole: "Backend Engineer",
      learningStyle: "examples-first, concise",
    });
    expect(cache.get(ns.profile)?.blobId).not.toBe("");
    const settings = await createUserSettingsRepo(t.db).get(alice.id);
    expect(settings?.onboardedAt).toBeInstanceOf(Date);
    expect(settings?.memoryConsentAt).toBeInstanceOf(Date);
  });

  it("requires explicit consent", async () => {
    const onboard = createOnboardingHandler({
      requireUser: as(alice),
      rateLimit: noLimit,
      userSettings: createUserSettingsRepo(t.db),
      memoryEvents: createMemoryEventsRepo(t.db),
      memory: () => memory,
      extract: vi.fn(),
      after: vi.fn(),
      namespacePrefix: PREFIX,
    });
    const res = await onboard(
      req(
        "/api/onboarding",
        json({
          targetRole: "PM",
          level: "junior",
          learningStyle: { format: "socratic", verbosity: "detailed" },
          consent: false,
        }),
      ),
    );
    expect(res.status).toBe(400);
  });
});

describe("memory inspector + me", () => {
  it("groups live-recalled memories by kind, newest first, with explorer links", async () => {
    const ns = deriveNamespaces(alice.id, 1, PREFIX);
    await memory.rememberMany({
      namespace: ns.facts,
      texts: [
        "[kind=mistake][at=2026-09-20T10:00:00.000Z] The user skipped the Result in interview mistakes.",
        "[kind=mistake][at=2026-09-21T10:00:00.000Z] The user rambled in interview mistakes practice.",
        "[kind=strength][at=2026-09-21T10:00:00.000Z] Clear strengths and improvements in structure.",
      ],
    });
    await memory.rememberMany({
      namespace: ns.profile,
      texts: ['[kind=profile][at=2026-09-21T10:00:00.000Z][v=1] {"targetRole":"SRE"}'],
    });
    const inspect = createMemoryInspectorHandler({
      requireUser: as(alice),
      rateLimit: noLimit,
      userSettings: createUserSettingsRepo(t.db),
      memoryEvents: createMemoryEventsRepo(t.db),
      memory: () => memory,
      namespacePrefix: PREFIX,
      explorerBlobUrl: "https://walruscan.com/mainnet/blob/",
    });
    const dto = (await (await inspect(req("/api/memory"))).json()) as MemoryInspectorDto;
    expect(dto.profile).toEqual({ targetRole: "SRE" });
    expect(dto.groups.mistake?.map((m) => m.text)).toEqual([
      "The user rambled in interview mistakes practice.",
      "The user skipped the Result in interview mistakes.",
    ]);
    expect(dto.groups.mistake?.[0]?.explorerUrl).toMatch(
      /^https:\/\/walruscan\.com\/mainnet\/blob\/fake-blob-/,
    );
    // other users see nothing
    const bobView = createMemoryInspectorHandler({
      requireUser: as(bob),
      rateLimit: noLimit,
      userSettings: createUserSettingsRepo(t.db),
      memoryEvents: createMemoryEventsRepo(t.db),
      memory: () => memory,
      namespacePrefix: PREFIX,
      explorerBlobUrl: "x/",
    });
    expect(
      ((await (await bobView(req("/api/memory"))).json()) as MemoryInspectorDto).totals.recalled,
    ).toBe(0);
  });

  it("invalidates the cached view as soon as a new memory is saved", async () => {
    const ns = deriveNamespaces(alice.id, 1, PREFIX);
    const inspect = createMemoryInspectorHandler({
      requireUser: as(alice),
      rateLimit: noLimit,
      userSettings: createUserSettingsRepo(t.db),
      memoryEvents: createMemoryEventsRepo(t.db),
      memory: () => memory,
      namespacePrefix: PREFIX,
      explorerBlobUrl: "x/",
    });
    const first = (await (await inspect(req("/api/memory"))).json()) as MemoryInspectorDto;
    expect(first.totals.recalled).toBe(0);
    const [o] = await memory.rememberMany({
      namespace: ns.facts,
      texts: ["[kind=goal][at=2026-09-21T10:00:00.000Z] interview mistakes goal to practise"],
    });
    const repo = createMemoryEventsRepo(t.db);
    await repo.recordAcceptedJobs([
      {
        userId: alice.id,
        coachingSessionId: null,
        namespace: ns.facts,
        kind: "goal",
        jobId: o?.jobId ?? "",
      },
    ]);
    await repo.markJobsDone([
      { jobId: o?.jobId ?? "", blobId: o?.ok ? o.blobId : "b", latencyMs: 1 },
    ]);
    const second = (await (await inspect(req("/api/memory"))).json()) as MemoryInspectorDto;
    expect(second.totals).toMatchObject({ doneBlobs: 1, recalled: 1 });
  });

  it("GET /api/me reports onboarding + admin flags", async () => {
    await createUserSettingsRepo(t.db).completeOnboarding(alice.id, new Date());
    const me = createMeHandler({
      getOptionalUser: async () => alice,
      userSettings: createUserSettingsRepo(t.db),
      memoryEvents: createMemoryEventsRepo(t.db),
      adminEmails: ["alice@example.test"],
    });
    expect(await (await me(req("/api/me"))).json()).toMatchObject({
      signedIn: true,
      user: { firstName: "Alice" },
      onboarded: true,
      memoryConsent: true,
      isAdmin: true,
    });
  });
});

describe("GET /api/me for visitors", () => {
  it("returns 200 { signedIn: false } instead of a 401", async () => {
    const me = createMeHandler({
      getOptionalUser: async () => null,
      userSettings: createUserSettingsRepo(t.db),
      memoryEvents: createMemoryEventsRepo(t.db),
      adminEmails: [],
    });
    const res = await me(req("/api/me"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signedIn: false });
  });
});

describe("admin evidence + health", () => {
  const identity = async () => ({
    accountId: "0xabc",
    delegatePublicKey: "pk",
    delegateSuiAddress: "0xaddr",
    relayer: "https://relayer",
    namespacePrefix: PREFIX,
  });

  it("403 for non-admins, pseudonymized metadata for admins", async () => {
    const deps = {
      evidence: createEvidenceRepo(t.db),
      adminEmails: ["alice@example.test"],
      identity,
    };
    expect(
      (await createEvidenceHandler({ ...deps, requireUser: as(bob) })(req("/api/admin/evidence")))
        .status,
    ).toBe(403);
    expect(
      (await createEvidenceHandler({ ...deps, requireUser: as(null) })(req("/api/admin/evidence")))
        .status,
    ).toBe(401);
    const res = await createEvidenceHandler({ ...deps, requireUser: as(alice) })(
      req("/api/admin/evidence"),
    );
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toContain('"pseudonym":"user-1"');
    expect(body).not.toContain(alice.id);
    expect(body).not.toContain("alice@example.test");
  });

  it("health reports db/relayer/model without secrets and 503 when down", async () => {
    const ok = createHealthHandler({
      pingDb: async () => true,
      memory: () => memory,
      modelId: "qwen/qwen3.8-27b",
    });
    const res = await ok();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ db: "ok", relayer: "ok", model: "qwen/qwen3.8-27b" });
    const down = createHealthHandler({
      pingDb: async () => false,
      memory: () => memory,
      modelId: "m",
    });
    const r503 = await down();
    expect(r503.status).toBe(503);
    expect(r503.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=15");
  });

  it("status mode answers 200 with the same body, so UI badges don't log failed requests", async () => {
    const down = createHealthHandler({
      pingDb: async () => false,
      memory: () => memory,
      modelId: "m",
    });
    const res = await down("status");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ db: "down", relayer: "ok" });
  });

  it("retries a failed probe once (cold start) and shares one in-flight probe", async () => {
    let pings = 0;
    const flaky = createHealthHandler({
      pingDb: async () => ++pings > 1, // first connection fails, retry succeeds
      memory: () => memory,
      modelId: "m",
    });
    const [a, b] = await Promise.all([flaky(), flaky("status")]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(pings).toBe(2); // one probe (+1 retry) for two concurrent requests
    expect((await a.json()).db).toBe("ok");
  });

  it("caches a degraded answer only briefly, then probes again", async () => {
    let clock = 1_000_000;
    let dbUp = false;
    let pings = 0;
    const h = createHealthHandler({
      pingDb: async () => {
        pings++;
        return dbUp;
      },
      memory: () => memory,
      modelId: "m",
      now: () => clock,
    });
    expect((await h()).status).toBe(503);
    const afterFirst = pings;
    dbUp = true;
    expect((await h()).status).toBe(503); // within the 3 s degraded window: reused
    expect(pings).toBe(afterFirst);
    clock += 3_100;
    expect((await h()).status).toBe(200); // re-probed after the short window
  });
});
