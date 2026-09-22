import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "@/lib/errors";
import { TtlCache } from "@/lib/ttl-cache";
import { createEvidenceHandler } from "@/server/api/evidence";
import { createHealthHandler } from "@/server/api/health";
import { createMeHandler } from "@/server/api/me";
import { createMemoryInspectorHandler } from "@/server/api/memory-inspector";
import { createOnboardingHandler } from "@/server/api/onboarding";
import { createSessionsHandlers } from "@/server/api/sessions";
import type { AuthUser } from "@/server/auth/session";
import { createCoachingSessionsRepo } from "@/server/db/repositories/coaching-sessions.repo";
import { createEvidenceRepo } from "@/server/db/repositories/evidence.repo";
import { createMemoryEventsRepo } from "@/server/db/repositories/memory-events.repo";
import { createUserSettingsRepo } from "@/server/db/repositories/user-settings.repo";
import * as schema from "@/server/db/schema";
import { createFakeMemory, type FakeMemoryPort } from "@/server/memory/fake-memory";
import { decodeMemory } from "@/server/memory/memory-format";
import { deriveNamespaces } from "@/server/memory/namespace";
import type { MemoryInspectorDto, SessionDetailDto, SessionDto } from "@/types/api";
import type { RecalledMemory } from "@/types/memory";
import { createTestDb, insertUser, type TestDb } from "../support/pglite";

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

function sessionsApi(user: AuthUser | null) {
  return createSessionsHandlers({
    requireUser: as(user),
    rateLimit: noLimit,
    sessions: createCoachingSessionsRepo(t.db),
    memoryEvents: createMemoryEventsRepo(t.db),
    memory: () => memory,
    now: () => new Date("2026-09-22T08:00:00Z"),
  });
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

  it("GET /api/me reports onboarding + admin flags", async () => {
    await createUserSettingsRepo(t.db).completeOnboarding(alice.id, new Date());
    const me = createMeHandler({
      requireUser: as(alice),
      userSettings: createUserSettingsRepo(t.db),
      memoryEvents: createMemoryEventsRepo(t.db),
      adminEmails: ["alice@example.test"],
    });
    expect(await (await me(req("/api/me"))).json()).toMatchObject({
      user: { firstName: "Alice" },
      onboarded: true,
      memoryConsent: true,
      isAdmin: true,
    });
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
    expect((await down()).status).toBe(503);
  });
});
