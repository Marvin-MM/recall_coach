import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSessionsHandlers } from "@/server/api/sessions";
import type { AuthUser } from "@/server/auth/session";
import { createCoachingSessionsRepo } from "@/server/db/repositories/coaching-sessions.repo";
import { createMemoryEventsRepo } from "@/server/db/repositories/memory-events.repo";
import { createUserSettingsRepo } from "@/server/db/repositories/user-settings.repo";
import * as schema from "@/server/db/schema";
import { createFakeMemory } from "@/server/memory/fake-memory";
import { encodeFact } from "@/server/memory/memory-format";
import { deriveNamespaces } from "@/server/memory/namespace";
import { createTranscriptStore } from "@/server/transcripts/transcript-store";
import type { PreviousSavesDto } from "@/types/api";
import type { MemoryDataPart } from "@/types/chat";
import { createChatHarness, extractionJson, readUiStream } from "../support/chat-harness";
import { createTestDb, insertUser, type TestDb } from "../support/pglite";
import { testKeyring } from "../support/transcripts";

let t: TestDb;
let user: AuthUser;

beforeAll(async () => {
  t = await createTestDb();
}, 60_000);
afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.reset();
  const row = await insertUser(t.db, {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Ada Lovelace",
  });
  user = { id: row.id, email: row.email, name: row.name, image: null };
  await createUserSettingsRepo(t.db).completeOnboarding(user.id, new Date("2026-09-20T00:00:00Z"));
});

const ns = () => deriveNamespaces(user.id, 1, "coach-test-v1");
const newSession = async () =>
  (
    await createCoachingSessionsRepo(t.db).createSession({
      userId: user.id,
      mode: "mock_interview",
      memoryEnabled: true,
      title: "Mock interview · 27 Sep",
    })
  ).id;
const turn = (sessionId: string, message: string, expectedSeq = 0) => ({
  sessionId,
  message,
  expectedSeq,
});
const systemPromptOf = (h: ReturnType<typeof createChatHarness>, call = 0) =>
  JSON.stringify(h.models.chat.doStreamCalls[call]?.prompt[0]);
const memoryPart = (chunks: Record<string, unknown>[]) =>
  chunks.find((c) => c.type === "data-memory")?.data as MemoryDataPart;

const REPLY = `**Scorecard** — Structure 4/5 · Specificity 3/5 · Impact 2/5 · Communication 4/5
Clear setup; the outcome was missing.
**Fix next time:** End with the metric: "cut p95 latency 40%".
Next: tell me about a conflict with a teammate.`;

describe("assignments across sessions", () => {
  it("session 1 saves the coach's fix; session 2 opens with it, recalled from Walrus", async () => {
    const s1 = await newSession();
    const h = createChatHarness(t.db, {
      user,
      model: {
        chatReply: REPLY,
        extractionJson: extractionJson(
          [
            {
              kind: "mistake",
              tag: "impact",
              text: "The user gave no metric for the caching project.",
            },
          ],
          { assignmentTag: "impact" },
        ),
      },
    });
    await readUiStream(await h.post(turn(s1, "We added a cache and things got faster.")));
    await h.runAfter();

    const lines = (h.memory.store.get(ns().facts) ?? []).map((m) => m.text);
    expect(lines).toContainEqual(
      expect.stringMatching(
        /^\[kind=assignment\]\[tag=impact\]\[at=[^\]]+\]\[session=[0-9a-f-]{36}\] Coach asked the user to end with the metric: "cut p95 latency 40%"\.$/,
      ),
    );
    // Postgres keeps metadata only: kind + blob id, never the text.
    const rows = await t.db.select().from(schema.memoryEvents);
    expect(rows.map((r) => r.kind).sort()).toEqual(["assignment", "mistake"]);
    expect(JSON.stringify(rows)).not.toContain("cut p95");

    await createCoachingSessionsRepo(t.db).endSession({ id: s1, userId: user.id }, new Date());
    const s2 = await newSession();
    const chunks = await readUiStream(await h.post(turn(s2, "Ready for today")));
    const prompt = systemPromptOf(h, 1);
    expect(prompt).toContain("LAST ASSIGNMENT (not yet done):");
    expect(prompt).toContain(
      'Coach asked the user to end with the metric: \\"cut p95 latency 40%\\".',
    );
    expect(memoryPart(chunks).recalled.map((c) => c.kind)).toContain("assignment");
  });

  it("the recap comes only from Walrus: Postgres rows alone never produce an assignment", async () => {
    const s1 = await newSession();
    await createMemoryEventsRepo(t.db).recordAcceptedJobs([
      {
        userId: user.id,
        coachingSessionId: s1,
        namespace: ns().facts,
        kind: "assignment",
        jobId: "job-a",
      },
    ]);
    await createMemoryEventsRepo(t.db).markJobsDone([
      { jobId: "job-a", blobId: "blob-a", latencyMs: 5 },
    ]);
    const s2 = await newSession();
    const h = createChatHarness(t.db, { user }); // empty Walrus namespace
    await readUiStream(await h.post(turn(s2, "Ready for today")));
    expect(systemPromptOf(h)).not.toContain("LAST ASSIGNMENT");
  });
});

describe("recall retry is logged", () => {
  it("records attempt 2 in recall_events when all matches were dropped once", async () => {
    const s1 = await newSession();
    const h = createChatHarness(t.db, {
      user,
      recallTimeoutMs: 3000,
      memory: {
        dropNextRecalls: 1,
        seed: {
          [ns().facts]: [
            encodeFact({
              kind: "mistake",
              tag: "impact",
              text: "The user gave no metric for the caching project.",
              at: new Date("2026-09-21T10:00:00Z"),
            }),
          ],
        },
      },
    });
    const chunks = await readUiStream(await h.post(turn(s1, "tell me about the caching project")));
    await h.runAfter();
    expect(memoryPart(chunks).degraded).toBe(false);
    const [event] = await t.db.select().from(schema.recallEvents);
    expect(event?.attempt).toBe(2);
  });

  it("records attempt 1 on a normal recall", async () => {
    const s1 = await newSession();
    const h = createChatHarness(t.db, { user });
    await readUiStream(await h.post(turn(s1, "hello coach")));
    await h.runAfter();
    const [event] = await t.db.select().from(schema.recallEvents);
    expect(event?.attempt).toBe(1);
  });
});

describe("last session's memories still saving", () => {
  async function pendingJobFor(sessionId: string, jobId: string, ageMs = 10_000) {
    const repo = createMemoryEventsRepo(t.db);
    await repo.recordAcceptedJobs([
      {
        userId: user.id,
        coachingSessionId: sessionId,
        namespace: ns().facts,
        kind: "mistake",
        jobId,
      },
    ]);
    await t.db
      .update(schema.memoryEvents)
      .set({ createdAt: new Date(Date.now() - ageMs) })
      .where(eq(schema.memoryEvents.jobId, jobId));
  }

  it("tells the coach notes may be missing while an earlier session has pending saves", async () => {
    const s1 = await newSession();
    await pendingJobFor(s1, "job-pending-1");
    const s2 = await newSession();
    const h = createChatHarness(t.db, { user });
    await readUiStream(await h.post(turn(s2, "hello coach")));
    expect(systemPromptOf(h)).toContain(
      "Some notes from the last session are still being saved and may be missing.",
    );
  });

  it("says nothing when the earlier session's saves are done", async () => {
    const s2 = await newSession();
    const h = createChatHarness(t.db, { user });
    await readUiStream(await h.post(turn(s2, "hello coach")));
    expect(systemPromptOf(h)).not.toContain("still being saved");
  });

  it("GET previous-saves returns a live count that drops as jobs reconcile (metadata only)", async () => {
    const memory = createFakeMemory();
    const s1 = await newSession();
    // Two real fake-relayer jobs: one completes on Walrus, one is unknown (still pending).
    const [done] = await memory.rememberMany({
      namespace: ns().facts,
      texts: ["[kind=mistake][tag=impact][at=2026-09-26T10:00:00.000Z] The user gave no metric."],
    });
    await pendingJobFor(s1, done?.jobId ?? "missing");
    await pendingJobFor(s1, "job-still-pending");
    const s2 = await newSession();
    const handlers = createSessionsHandlers({
      requireUser: async () => user,
      rateLimit: { enforce: async () => {} },
      sessions: createCoachingSessionsRepo(t.db),
      memoryEvents: createMemoryEventsRepo(t.db),
      userSettings: createUserSettingsRepo(t.db),
      transcripts: createTranscriptStore(t.db, testKeyring),
      memory: () => memory,
      namespacePrefix: "coach-test-v1",
      explorerBlobUrl: "https://walruscan.test/blob/",
    });
    const res = await handlers.previousSaves(new Request("http://localhost"), s2);
    expect(res.status).toBe(200);
    const body = (await res.json()) as PreviousSavesDto;
    expect(body).toEqual({ sessionId: s1, pending: 1 });
    expect(JSON.stringify(body)).not.toContain("metric");

    // The current session's own pending saves are not "the last session's".
    const own = await handlers.previousSaves(new Request("http://localhost"), s1);
    expect(((await own.json()) as PreviousSavesDto).sessionId).toBeNull();
  });
});
