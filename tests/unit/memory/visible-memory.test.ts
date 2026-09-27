import { describe, expect, it, vi } from "vitest";
import { RUBRIC_DIMENSIONS } from "@/config/coach";
import { TtlCache } from "@/lib/ttl-cache";
import { buildMemoryPart } from "@/server/chat/memory-chips";
import type { MemoryEventsRepo } from "@/server/db/repositories/memory-events.repo";
import type { ExtractionResult } from "@/server/llm/extraction";
import { buildSystemPrompt } from "@/server/llm/prompts/system";
import {
  assignmentText,
  parseFixNextTime,
  selectLatestAssignment,
} from "@/server/memory/assignment";
import type { CachedAssignment } from "@/server/memory/assignment-cache";
import { createFakeMemory } from "@/server/memory/fake-memory";
import { decodeMemory, encodeFact } from "@/server/memory/memory-format";
import { deriveNamespaces } from "@/server/memory/namespace";
import { countMistakeSessions, detectPatterns } from "@/server/memory/patterns";
import { persistTurn } from "@/server/memory/persist-service";
import { RECALL_RETRY_DELAY_MS, recallForTurn } from "@/server/memory/recall-service";
import { MEMORY_TAGS } from "@/server/memory/tags";
import type { RecalledMemory } from "@/types/memory";

const ns = deriveNamespaces("user-1", 1, "coach-v1");
const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const S3 = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-09-27T10:00:00Z");

let blob = 0;
function mem(line: string, distance = 0.3): RecalledMemory {
  return { blobId: `b${++blob}`, text: line, distance, decoded: decodeMemory(line) };
}
function mistake(tag: "structure" | "impact" | "other", sessionId: string, day: number) {
  return mem(
    encodeFact({
      kind: "mistake",
      tag,
      text: `The user skipped the Result in a STAR answer (${tag} ${day}).`,
      at: new Date(Date.UTC(2026, 8, day)),
      sessionId,
    }),
  );
}

describe("tag vocabulary", () => {
  it("is the rubric dimensions (lower-cased) plus other", () => {
    expect(MEMORY_TAGS).toEqual([...RUBRIC_DIMENSIONS.map((d) => d.toLowerCase()), "other"]);
  });
});

describe("pattern detection", () => {
  it("3 same-tag mistakes in 2 sessions → N=2 and a pattern line", () => {
    const memories = [
      mistake("structure", S1, 20),
      mistake("structure", S1, 20),
      mistake("structure", S2, 24),
    ];
    expect(detectPatterns(memories, S3)).toEqual([{ tag: "structure", sessions: 2 }]);
    const prompt = buildSystemPrompt({
      mode: "mock_interview",
      profile: null,
      facts: memories,
      recap: [],
      memoryEnabled: true,
      degraded: false,
      firstTurn: false,
      patterns: detectPatterns(memories, S3),
      now: NOW,
    });
    expect(prompt).toContain(
      "Pattern: answer structure (e.g. STAR order, a missing Result, no clear opening) seen in 2 of the user's previous sessions.",
    );
    expect(prompt).toContain("in N sessions I can see");
  });

  it("the same session twice → N=1 and no pattern line", () => {
    const memories = [mistake("impact", S1, 20), mistake("impact", S1, 21)];
    expect(countMistakeSessions(memories, S3)).toEqual([{ tag: "impact", sessions: 1 }]);
    expect(detectPatterns(memories, S3)).toEqual([]);
    const prompt = buildSystemPrompt({
      mode: "mock_interview",
      profile: null,
      facts: memories,
      recap: [],
      memoryEnabled: true,
      degraded: false,
      firstTurn: false,
      patterns: detectPatterns(memories, S3),
      now: NOW,
    });
    expect(prompt).not.toContain("Pattern:");
  });

  it("does not count the current session's own mistakes", () => {
    const memories = [mistake("structure", S1, 20), mistake("structure", S2, 24)];
    expect(detectPatterns(memories, S2)).toEqual([]);
  });

  it("untagged (legacy), untyped and session-less lines don't crash and never form a pattern", () => {
    const legacy = (s: string) =>
      mem(`[kind=mistake][at=2026-09-20T09:00:00.000Z][session=${s}] The user rambled.`);
    const memories = [
      legacy(S1),
      legacy(S2),
      mem("a plain untyped note"),
      mem(encodeFact({ kind: "mistake", tag: "impact", text: "No metric at setup.", at: NOW })),
    ];
    expect(countMistakeSessions(memories, S3)).toEqual([{ tag: "other", sessions: 2 }]);
    expect(detectPatterns(memories, S3)).toEqual([]);
  });

  it("labels mistake chips whose tag repeats with 'seen in N sessions'", async () => {
    const memories = [
      mistake("structure", S1, 20),
      mistake("structure", S2, 24),
      mistake("impact", S2, 24),
    ];
    const part = buildMemoryPart(
      {
        profile: null,
        profileMemory: null,
        facts: memories,
        recap: [],
        degraded: false,
        reason: null,
        latencyMs: 1,
        blobIds: memories.map((m) => m.blobId),
        bestDistance: 0.3,
        assignment: null,
        patterns: detectPatterns(memories, S3),
        attempt: 1,
      },
      false,
    );
    expect(part.recalled.map((c) => c.seenInSessions)).toEqual([2, 2, undefined]);
  });
});

describe("assignments", () => {
  const REPLY = `**Scorecard** — Structure 3/5 · Specificity 2/5 · Impact 2/5 · Communication 4/5
Clear situation, but no outcome.
**Fix next time:** End with the metric: "cut p95 latency 40%".
Next question: tell me about a conflict.`;

  it("parses the coach's 'Fix next time' line into an assignment sentence", () => {
    const fix = parseFixNextTime(REPLY);
    expect(fix).toBe('End with the metric: "cut p95 latency 40%".');
    expect(assignmentText(fix ?? "")).toBe(
      'Coach asked the user to end with the metric: "cut p95 latency 40%".',
    );
    expect(parseFixNextTime("Great answer! Next question?")).toBeNull();
  });

  it("selects the newest assignment and marks it completed by a later same-tag improvement", () => {
    const old = mem(
      encodeFact({
        kind: "assignment",
        tag: "structure",
        text: "Coach asked the user to open with the headline.",
        at: new Date("2026-09-20T09:00:00Z"),
        sessionId: S1,
      }),
    );
    const latest = mem(
      encodeFact({
        kind: "assignment",
        tag: "impact",
        text: "Coach asked the user to end with the metric.",
        at: new Date("2026-09-24T09:00:00Z"),
        sessionId: S2,
      }),
    );
    expect(selectLatestAssignment([old, latest])).toMatchObject({
      tag: "impact",
      completed: false,
    });
    const done = mem(
      encodeFact({
        kind: "improvement",
        tag: "impact",
        text: "The user did what the coach asked: end with the metric.",
        at: new Date("2026-09-25T09:00:00Z"),
        sessionId: S3,
      }),
    );
    expect(selectLatestAssignment([old, latest, done])?.completed).toBe(true);
  });

  const repo = (): MemoryEventsRepo => ({
    recordAcceptedJobs: vi.fn(async () => {}),
    markJobsDone: vi.fn(async (jobs) => ({ done: jobs.length, duplicates: 0 })),
    markJobsFailed: vi.fn(async () => {}),
    markJobFailed: vi.fn(async () => {}),
    replaceJob: vi.fn(async () => {}),
    countDoneBlobsByUser: vi.fn(async () => 0),
    listForSession: vi.fn(async () => []),
    countJobsForSession: vi.fn(async () => ({ pending: 0, done: 0, failed: 0 })),
    pendingFromOtherSession: vi.fn(async () => null),
    countStalePending: vi.fn(async () => 0),
    listPending: vi.fn(async () => []),
  });
  const extraction = (r: Partial<ExtractionResult>) =>
    vi.fn(async () => ({
      facts: [],
      profileUpdate: null,
      assignmentTag: null,
      assignmentCompleted: false,
      ...r,
    }));

  it("persists the coach's fix as [kind=assignment][tag=…] and caches it for later turns", async () => {
    const fake = createFakeMemory();
    const cache = new TtlCache<CachedAssignment>(60_000);
    const summary = await persistTurn(
      {
        memory: fake,
        memoryEvents: repo(),
        assignmentCache: cache,
        extract: extraction({ assignmentTag: "impact" }),
        now: () => NOW,
      },
      {
        userId: "u",
        sessionId: S2,
        namespaces: ns,
        lastUserText: "answer",
        assistantText: REPLY,
        profile: null,
        recalledTexts: [],
        knownMistakes: [],
      },
    );
    expect(summary.assignmentSaved).toBe(true);
    const lines = (fake.store.get(ns.facts) ?? []).map((m) => m.text);
    expect(lines).toEqual([
      `[kind=assignment][tag=impact][at=2026-09-27T10:00:00.000Z][session=${S2}] Coach asked the user to end with the metric: "cut p95 latency 40%".`,
    ]);
    expect(cache.get(ns.facts)?.memory?.decoded).toMatchObject({
      kind: "assignment",
      tag: "impact",
    });
  });

  it("a later success writes an improvement with the SAME tag as the assignment", async () => {
    const fake = createFakeMemory();
    const cache = new TtlCache<CachedAssignment>(60_000);
    const summary = await persistTurn(
      {
        memory: fake,
        memoryEvents: repo(),
        assignmentCache: cache,
        // Even if the model tags the turn differently, the improvement keeps the assignment's tag.
        extract: extraction({ assignmentCompleted: true }),
        now: () => NOW,
      },
      {
        userId: "u",
        sessionId: S3,
        namespaces: ns,
        lastUserText: "…and p95 latency dropped 40%.",
        assistantText: "Great — you ended with the metric this time.",
        profile: null,
        recalledTexts: [],
        knownMistakes: [],
        lastAssignment: { body: "Coach asked the user to end with the metric.", tag: "impact" },
      },
    );
    expect(summary.assignmentCompleted).toBe(true);
    const [line] = (fake.store.get(ns.facts) ?? []).map((m) => m.text);
    expect(line).toMatch(/^\[kind=improvement\]\[tag=impact\]/);
    expect(line).toContain("The user did what the coach asked: end with the metric.");
    expect(cache.get(ns.facts)).toEqual({ memory: null });
  });

  it("no improvement without a known assignment, even if the model says completed", async () => {
    const fake = createFakeMemory();
    await persistTurn(
      {
        memory: fake,
        memoryEvents: repo(),
        extract: extraction({ assignmentCompleted: true }),
        now: () => NOW,
      },
      {
        userId: "u",
        sessionId: S3,
        namespaces: ns,
        lastUserText: "x",
        assistantText: "Nice.",
        profile: null,
        recalledTexts: [],
        knownMistakes: [],
      },
    );
    expect(fake.store.get(ns.facts) ?? []).toHaveLength(0);
  });

  it("the new session's opening reads the latest assignment from Walrus Memory (not the cache)", async () => {
    const line = encodeFact({
      kind: "assignment",
      tag: "impact",
      text: "Coach asked the user to end with the metric.",
      at: new Date("2026-09-24T09:00:00Z"),
      sessionId: S2,
    });
    const fake = createFakeMemory({ seed: { [ns.facts]: [line] } });
    const cache = new TtlCache<CachedAssignment>(60_000);
    cache.set(ns.facts, { memory: null }); // stale "none" from an earlier turn
    const r = await recallForTurn(
      { memory: fake, timeoutMs: 1000, assignmentCache: cache },
      {
        namespaces: ns,
        mode: "mock_interview",
        lastUserText: "hi",
        firstTurn: true,
        sessionId: S3,
      },
    );
    expect(r.assignment?.body).toBe("Coach asked the user to end with the metric.");
    const prompt = buildSystemPrompt({
      mode: "mock_interview",
      profile: null,
      facts: r.facts,
      recap: r.recap,
      assignment: r.assignment?.memory ?? null,
      memoryEnabled: true,
      degraded: false,
      firstTurn: true,
      now: NOW,
    });
    expect(prompt).toContain("LAST ASSIGNMENT (not yet done):");
    expect(prompt).toContain("Coach asked the user to end with the metric.");
    expect(prompt).toMatch(/open with ONE sentence naming the LAST ASSIGNMENT/);
  });

  it("with nothing on Walrus there is no assignment, whatever the cache or Postgres holds", async () => {
    const r = await recallForTurn(
      { memory: createFakeMemory(), timeoutMs: 1000 },
      {
        namespaces: ns,
        mode: "mock_interview",
        lastUserText: "hi",
        firstTurn: true,
        sessionId: S3,
      },
    );
    expect(r.assignment).toBeNull();
  });
});

describe("recall retry before degrading", () => {
  const input = {
    namespaces: ns,
    mode: "mock_interview" as const,
    lastUserText: "tell me about caching",
    firstTurn: false,
  };
  const seeded = () =>
    createFakeMemory({
      seed: {
        [ns.facts]: [
          encodeFact({
            kind: "mistake",
            tag: "impact",
            text: "The user gave no metric for caching.",
            at: NOW,
            sessionId: S1,
          }),
        ],
      },
    });

  it("retries once ~400 ms later when all matches were dropped, and recovers (attempt 2)", async () => {
    const fake = seeded();
    fake.configure({ dropNextRecalls: 1 });
    const sleep = vi.fn(async () => {});
    const r = await recallForTurn({ memory: fake, timeoutMs: 5000, sleep }, input);
    expect(sleep).toHaveBeenCalledWith(RECALL_RETRY_DELAY_MS);
    expect(r).toMatchObject({ attempt: 2, degraded: false });
    expect(r.facts).toHaveLength(1);
  });

  it("degrades after the single retry when matches are still dropped", async () => {
    const fake = seeded();
    fake.configure({ failRecall: "dropped" });
    const r = await recallForTurn({ memory: fake, timeoutMs: 5000, sleep: async () => {} }, input);
    expect(r).toMatchObject({ attempt: 2, degraded: true, reason: "MEMORY_RECALL_DROPPED" });
  });

  it("retries an all-empty recall only when the user has saved memories", async () => {
    const fake = seeded();
    fake.configure({ emptyNextRecalls: 3 }); // facts, profile, assignment
    const r = await recallForTurn(
      { memory: fake, timeoutMs: 5000, sleep: async () => {}, hasSavedMemories: async () => true },
      input,
    );
    expect(r.attempt).toBe(2);
    expect(r.facts).toHaveLength(1);

    const fresh = createFakeMemory();
    const hasSaved = vi.fn(async () => false);
    const none = await recallForTurn(
      { memory: fresh, timeoutMs: 5000, sleep: async () => {}, hasSavedMemories: hasSaved },
      input,
    );
    expect(hasSaved).toHaveBeenCalled();
    expect(none).toMatchObject({ attempt: 1, degraded: false });
  });

  it("skips the retry when it would not fit inside the recall timeout", async () => {
    const fake = seeded();
    fake.configure({ dropNextRecalls: 1 });
    const sleep = vi.fn(async () => {});
    const r = await recallForTurn({ memory: fake, timeoutMs: 300, sleep }, input);
    expect(sleep).not.toHaveBeenCalled();
    expect(r.attempt).toBe(1);
  });
});

describe("pending saves from the last session", () => {
  it("adds the 'still being saved' line only when an earlier session has pending saves", () => {
    const base = {
      mode: "mock_interview" as const,
      profile: null,
      facts: [],
      recap: [],
      memoryEnabled: true,
      degraded: false,
      firstTurn: true,
      now: NOW,
    };
    expect(buildSystemPrompt({ ...base, previousSessionPending: 2 })).toContain(
      "Some notes from the last session are still being saved and may be missing.",
    );
    expect(buildSystemPrompt({ ...base, previousSessionPending: 0 })).not.toContain(
      "still being saved",
    );
  });
});
