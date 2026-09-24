import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createCoachingSessionsRepo } from "@/server/db/repositories/coaching-sessions.repo";
import { createEvidenceRepo } from "@/server/db/repositories/evidence.repo";
import { createMemoryEventsRepo } from "@/server/db/repositories/memory-events.repo";
import { createRecallEventsRepo } from "@/server/db/repositories/recall-events.repo";
import { createUserSettingsRepo } from "@/server/db/repositories/user-settings.repo";
import * as schema from "@/server/db/schema";
import { createTestDb, insertUser, type TestDb } from "../../support/pglite";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
}, 60_000);
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await t.reset();
});

const count = async (
  table: "user_settings" | "coaching_sessions" | "memory_events" | "recall_events",
) => {
  const res = await t.client.query<{ n: number }>(`select count(*)::int as n from "${table}"`);
  return res.rows[0]?.n ?? 0;
};

describe("coaching sessions repo", () => {
  it("creates user_settings and the session in one transaction", async () => {
    const u = await insertUser(t.db);
    const repo = createCoachingSessionsRepo(t.db);
    const s = await repo.createSession({
      userId: u.id,
      mode: "drill",
      memoryEnabled: true,
      title: "Drill · 22 Sep",
    });
    expect(s.turnCount).toBe(0);
    expect(await count("user_settings")).toBe(1);
    // Idempotent settings creation on a second session.
    await repo.createSession({
      userId: u.id,
      mode: "review",
      memoryEnabled: false,
      title: "Review · 22 Sep",
    });
    expect(await count("user_settings")).toBe(1);
  });

  it("rolls back user_settings when the session insert fails", async () => {
    const repo = createCoachingSessionsRepo(t.db);
    // Unknown user → FK violation on coaching_sessions AFTER settings insert.
    await expect(
      repo.createSession({ userId: "ghost", mode: "drill", memoryEnabled: true, title: "x" }),
    ).rejects.toThrow();
    expect(await count("user_settings")).toBe(0);
    expect(await count("coaching_sessions")).toBe(0);
  });

  it("only returns sessions owned by the requesting user", async () => {
    const a = await insertUser(t.db);
    const b = await insertUser(t.db);
    const repo = createCoachingSessionsRepo(t.db);
    const s = await repo.createSession({
      userId: a.id,
      mode: "drill",
      memoryEnabled: true,
      title: "x",
    });
    expect(await repo.getForUser({ id: s.id, userId: a.id })).not.toBeNull();
    expect(await repo.getForUser({ id: s.id, userId: b.id })).toBeNull();
    expect(await repo.incrementTurn({ id: s.id, userId: b.id })).toBeNull();
    expect(await repo.endSession({ id: s.id, userId: b.id })).toBeNull();
  });

  it("increments turns atomically and blocks memory toggles after the first turn", async () => {
    const u = await insertUser(t.db);
    const repo = createCoachingSessionsRepo(t.db);
    const s = await repo.createSession({
      userId: u.id,
      mode: "mock_interview",
      memoryEnabled: true,
      title: "x",
    });
    const key = { id: s.id, userId: u.id };
    expect((await repo.setMemoryEnabled(key, false))?.memoryEnabled).toBe(false);
    await Promise.all([repo.incrementTurn(key), repo.incrementTurn(key), repo.incrementTurn(key)]);
    expect((await repo.getForUser(key))?.turnCount).toBe(3);
    expect(await repo.setMemoryEnabled(key, true)).toBeNull();
  });

  it("ends sessions idempotently and blocks toggles on ended sessions", async () => {
    const u = await insertUser(t.db);
    const repo = createCoachingSessionsRepo(t.db);
    const s = await repo.createSession({
      userId: u.id,
      mode: "free_chat",
      memoryEnabled: true,
      title: "x",
    });
    const key = { id: s.id, userId: u.id };
    const ended = await repo.endSession(key);
    expect(ended?.endedAt).toBeInstanceOf(Date);
    const again = await repo.endSession(key);
    expect(again?.endedAt?.getTime()).toBe(ended?.endedAt?.getTime());
    expect(await repo.setMemoryEnabled(key, false)).toBeNull();
  });

  it("lists recent sessions with saved-memory counts, newest first", async () => {
    const u = await insertUser(t.db);
    const repo = createCoachingSessionsRepo(t.db);
    const mem = createMemoryEventsRepo(t.db);
    const s1 = await repo.createSession({
      userId: u.id,
      mode: "drill",
      memoryEnabled: true,
      title: "one",
    });
    const s2 = await repo.createSession({
      userId: u.id,
      mode: "review",
      memoryEnabled: true,
      title: "two",
    });
    await mem.recordAcceptedJobs([
      { userId: u.id, coachingSessionId: s1.id, namespace: "ns", kind: "mistake", jobId: "j1" },
      { userId: u.id, coachingSessionId: s1.id, namespace: "ns", kind: "goal", jobId: "j2" },
    ]);
    await mem.markJobsDone([{ jobId: "j1", blobId: "b1", latencyMs: 10 }]);
    const list = await repo.listRecent(u.id);
    expect(list.map((x) => x.id)).toEqual([s2.id, s1.id]);
    expect(list.find((x) => x.id === s1.id)?.savedMemories).toBe(1);
    expect(list.find((x) => x.id === s2.id)?.savedMemories).toBe(0);
    expect(await repo.countByUser(u.id)).toBe(2);
  });
});

describe("memory events repo", () => {
  it("rolls back the whole batch when one insert fails", async () => {
    const u = await insertUser(t.db);
    const mem = createMemoryEventsRepo(t.db);
    await expect(
      mem.recordAcceptedJobs([
        { userId: u.id, coachingSessionId: null, namespace: "ns", kind: "mistake", jobId: "dup" },
        { userId: u.id, coachingSessionId: null, namespace: "ns", kind: "goal", jobId: "ok-1" },
        { userId: u.id, coachingSessionId: null, namespace: "ns", kind: "goal", jobId: "dup" },
      ]),
    ).rejects.toThrow();
    expect(await count("memory_events")).toBe(0);
  });

  it("enforces unique job_id and blob_id", async () => {
    const u = await insertUser(t.db);
    const mem = createMemoryEventsRepo(t.db);
    await mem.recordAcceptedJobs([
      { userId: u.id, coachingSessionId: null, namespace: "ns", kind: "goal", jobId: "j1" },
    ]);
    await expect(
      mem.recordAcceptedJobs([
        { userId: u.id, coachingSessionId: null, namespace: "ns", kind: "goal", jobId: "j1" },
      ]),
    ).rejects.toThrow();
    await expect(
      t.db.insert(schema.memoryEvents).values([
        { userId: u.id, namespace: "ns", kind: "goal", jobId: "a", blobId: "same" },
        { userId: u.id, namespace: "ns", kind: "goal", jobId: "b", blobId: "same" },
      ]),
    ).rejects.toThrow();
  });

  it("rejects status='done' without a blob_id (CHECK constraint)", async () => {
    const u = await insertUser(t.db);
    await expect(
      t.db
        .insert(schema.memoryEvents)
        .values({ userId: u.id, namespace: "ns", kind: "goal", jobId: "x", status: "done" }),
    ).rejects.toThrow();
  });

  it("marks jobs done/failed and counts them per session", async () => {
    const u = await insertUser(t.db);
    const sessions = createCoachingSessionsRepo(t.db);
    const s = await sessions.createSession({
      userId: u.id,
      mode: "drill",
      memoryEnabled: true,
      title: "x",
    });
    const mem = createMemoryEventsRepo(t.db);
    await mem.recordAcceptedJobs(
      ["a", "b", "c"].map((jobId) => ({
        userId: u.id,
        coachingSessionId: s.id,
        namespace: "ns",
        kind: "mistake" as const,
        jobId,
      })),
    );
    expect(await mem.countJobsForSession(u.id, s.id)).toEqual({ pending: 3, done: 0, failed: 0 });
    const res = await mem.markJobsDone([
      { jobId: "a", blobId: "blob-a", latencyMs: 100 },
      { jobId: "b", blobId: "blob-b", latencyMs: 120 },
    ]);
    expect(res).toEqual({ done: 2, duplicates: 0 });
    await mem.markJobFailed({ jobId: "c", errorCode: "TIMEOUT", latencyMs: null });
    expect(await mem.countJobsForSession(u.id, s.id)).toEqual({ pending: 0, done: 2, failed: 1 });
    expect(await mem.countDoneBlobsByUser(u.id)).toBe(2);
    // A done job cannot be flipped to failed.
    await mem.markJobsFailed([{ jobId: "a", errorCode: "LATE", latencyMs: 1 }]);
    const row = await t.db
      .select()
      .from(schema.memoryEvents)
      .where(eq(schema.memoryEvents.jobId, "a"));
    expect(row[0]?.status).toBe("done");
  });

  it("falls back row-by-row when a blob id collides and marks the duplicate failed", async () => {
    const u = await insertUser(t.db);
    const mem = createMemoryEventsRepo(t.db);
    await mem.recordAcceptedJobs(
      ["a", "b", "c"].map((jobId) => ({
        userId: u.id,
        coachingSessionId: null,
        namespace: "ns",
        kind: "goal" as const,
        jobId,
      })),
    );
    await mem.markJobsDone([{ jobId: "a", blobId: "blob-1", latencyMs: 1 }]);
    const res = await mem.markJobsDone([
      { jobId: "b", blobId: "blob-2", latencyMs: 1 },
      { jobId: "c", blobId: "blob-1", latencyMs: 1 },
    ]);
    expect(res).toEqual({ done: 1, duplicates: 1 });
    const c = await t.db
      .select()
      .from(schema.memoryEvents)
      .where(eq(schema.memoryEvents.jobId, "c"));
    expect(c[0]?.status).toBe("failed");
    expect(c[0]?.errorCode).toBe("DUPLICATE_BLOB_ID");
  });

  it("re-points a failed row to a resubmitted job", async () => {
    const u = await insertUser(t.db);
    const mem = createMemoryEventsRepo(t.db);
    await mem.recordAcceptedJobs([
      { userId: u.id, coachingSessionId: null, namespace: "ns", kind: "mistake", jobId: "old" },
    ]);
    await mem.markJobsFailed([{ jobId: "old", errorCode: "JOB_FAILED_TRANSIENT", latencyMs: 5 }]);
    await mem.replaceJob("old", "new");
    const rows = await t.db.select().from(schema.memoryEvents);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      jobId: "new",
      status: "pending",
      errorCode: null,
      kind: "mistake",
    });
  });

  it("counts stale pending jobs", async () => {
    const u = await insertUser(t.db);
    const mem = createMemoryEventsRepo(t.db);
    await mem.recordAcceptedJobs([
      { userId: u.id, coachingSessionId: null, namespace: "ns", kind: "goal", jobId: "old" },
    ]);
    expect(await mem.countStalePending(new Date(Date.now() + 60_000))).toBe(1);
    expect(await mem.countStalePending(new Date(Date.now() - 60_000))).toBe(0);
  });
});

describe("user settings repo", () => {
  it("keeps the original consent timestamp on re-onboarding", async () => {
    const u = await insertUser(t.db);
    const repo = createUserSettingsRepo(t.db);
    const first = new Date("2026-09-01T10:00:00Z");
    const second = new Date("2026-09-20T10:00:00Z");
    await repo.completeOnboarding(u.id, first);
    const row = await repo.completeOnboarding(u.id, second);
    expect(row.onboardedAt?.toISOString()).toBe(second.toISOString());
    expect(row.memoryConsentAt?.toISOString()).toBe(first.toISOString());
    expect((await repo.get(u.id))?.namespaceVersion).toBe(1);
  });
});

describe("FK cascade", () => {
  it("deleting a user removes settings, sessions, memory and recall events", async () => {
    const u = await insertUser(t.db);
    const sessions = createCoachingSessionsRepo(t.db);
    const s = await sessions.createSession({
      userId: u.id,
      mode: "drill",
      memoryEnabled: true,
      title: "x",
    });
    await createMemoryEventsRepo(t.db).recordAcceptedJobs([
      { userId: u.id, coachingSessionId: s.id, namespace: "ns", kind: "goal", jobId: "j" },
    ]);
    await createRecallEventsRepo(t.db).record({
      userId: u.id,
      coachingSessionId: s.id,
      recalledBlobIds: ["b"],
      resultCount: 1,
      bestDistance: 0.2,
      latencyMs: 12.7,
      degraded: false,
      degradedReason: null,
    });
    await t.db.delete(schema.user).where(eq(schema.user.id, u.id));
    for (const table of [
      "user_settings",
      "coaching_sessions",
      "memory_events",
      "recall_events",
    ] as const) {
      expect(await count(table)).toBe(0);
    }
  });

  it("deleting a session keeps memory events but nulls the session link", async () => {
    const u = await insertUser(t.db);
    const s = await createCoachingSessionsRepo(t.db).createSession({
      userId: u.id,
      mode: "drill",
      memoryEnabled: true,
      title: "x",
    });
    await createMemoryEventsRepo(t.db).recordAcceptedJobs([
      { userId: u.id, coachingSessionId: s.id, namespace: "ns", kind: "goal", jobId: "j" },
    ]);
    await t.db.delete(schema.coachingSessions).where(eq(schema.coachingSessions.id, s.id));
    const rows = await t.db.select().from(schema.memoryEvents);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.coachingSessionId).toBeNull();
  });
});

describe("evidence repo", () => {
  it("aggregates per-user metadata in stable creation order", async () => {
    const a = await insertUser(t.db, { createdAt: new Date("2026-09-01T00:00:00Z") });
    const b = await insertUser(t.db, { createdAt: new Date("2026-09-02T00:00:00Z") });
    const s = await createCoachingSessionsRepo(t.db).createSession({
      userId: a.id,
      mode: "drill",
      memoryEnabled: true,
      title: "x",
    });
    const mem = createMemoryEventsRepo(t.db);
    await mem.recordAcceptedJobs([
      { userId: a.id, coachingSessionId: s.id, namespace: "ns", kind: "mistake", jobId: "1" },
      { userId: a.id, coachingSessionId: s.id, namespace: "ns", kind: "mistake", jobId: "2" },
      { userId: a.id, coachingSessionId: s.id, namespace: "ns", kind: "goal", jobId: "3" },
    ]);
    await mem.markJobsDone([
      { jobId: "1", blobId: "x1", latencyMs: 1 },
      { jobId: "2", blobId: "x2", latencyMs: 1 },
    ]);
    const recalls = createRecallEventsRepo(t.db);
    const base = {
      userId: a.id,
      coachingSessionId: s.id,
      bestDistance: null,
      latencyMs: 5,
      degradedReason: null,
    };
    await recalls.record({ ...base, recalledBlobIds: ["x1"], resultCount: 1, degraded: false });
    await recalls.record({ ...base, recalledBlobIds: [], resultCount: 0, degraded: true });
    const rows = await createEvidenceRepo(t.db).perUser();
    expect(rows.map((r) => r.userId)).toEqual([a.id, b.id]);
    expect(rows[0]).toMatchObject({
      doneTotal: 2,
      pendingTotal: 1,
      sessions: 1,
      recalls: 2,
      recallHits: 1,
    });
    expect(rows[0]?.doneByKind).toEqual({ mistake: 2 });
    expect(rows[1]).toMatchObject({ doneTotal: 0, sessions: 0, firstActivity: null });
  });

  it("summarizes recall hit rate and latency percentiles across all users", async () => {
    const repo = createEvidenceRepo(t.db);
    expect(await repo.recallSummary()).toEqual({
      turns: 0,
      hits: 0,
      degraded: 0,
      medianLatencyMs: null,
      p95LatencyMs: null,
    });
    const u = await insertUser(t.db);
    const recalls = createRecallEventsRepo(t.db);
    const base = {
      userId: u.id,
      coachingSessionId: null,
      bestDistance: null,
      degradedReason: null,
    };
    for (const [latencyMs, resultCount, degraded] of [
      [100, 2, false],
      [200, 0, false],
      [300, 1, false],
      [4000, 0, true],
    ] as const) {
      await recalls.record({ ...base, recalledBlobIds: [], latencyMs, resultCount, degraded });
    }
    expect(await repo.recallSummary()).toEqual({
      turns: 4,
      hits: 2,
      degraded: 1,
      medianLatencyMs: 250,
      p95LatencyMs: 3445,
    });
  });
});
