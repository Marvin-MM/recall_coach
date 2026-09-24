import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createCoachingSessionsRepo } from "@/server/db/repositories/coaching-sessions.repo";
import { loadThreadHistory } from "@/server/transcripts/thread-history";
import { createTranscriptStore } from "@/server/transcripts/transcript-store";
import { createTestDb, insertUser, type TestDb } from "../support/pglite";
import { testKeyring } from "../support/transcripts";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
}, 60_000);
afterAll(async () => t.close());
beforeEach(async () => t.reset());

async function sessionWith(userId: string, turns: { user: string; reply: string | null }[]) {
  const s = await createCoachingSessionsRepo(t.db).createSession({
    userId,
    mode: "drill",
    memoryEnabled: true,
    title: "Drill · 22 Sep",
  });
  const store = createTranscriptStore(t.db, testKeyring);
  let seq = 0;
  for (const turn of turns) {
    await store.beginTurn({
      userId,
      sessionId: s.id,
      text: turn.user,
      expectedSeq: seq,
      now: new Date(),
    });
    await store.appendAssistant({
      userId,
      sessionId: s.id,
      seq: seq + 1,
      text: turn.reply ?? "",
      status: turn.reply === null ? "failed" : "ok",
      now: new Date(),
    });
    seq += 2;
  }
  return s.id;
}

const deps = () => ({ db: t.db, keyring: testKeyring });

describe("loadThreadHistory (the coach's only transcript reader)", () => {
  it("returns only this session's ok messages, oldest first, newest N turns", async () => {
    const u = await insertUser(t.db);
    const a = await sessionWith(u.id, [
      { user: "a1", reply: "r1" },
      { user: "a2", reply: null },
      { user: "a3", reply: "r3" },
    ]);
    await sessionWith(u.id, [{ user: "OTHER-SESSION", reply: "OTHER-REPLY" }]);

    const all = await loadThreadHistory({ userId: u.id, sessionId: a, maxTurns: 12 }, deps());
    expect(all.map((m) => `${m.role}:${m.text}`)).toEqual([
      "user:a1",
      "assistant:r1",
      "user:a2",
      "user:a3",
      "assistant:r3",
    ]);
    const last = await loadThreadHistory({ userId: u.id, sessionId: a, maxTurns: 1 }, deps());
    expect(last.map((m) => m.text)).toEqual(["a3", "r3"]);
  });

  it("404 for another user's session; 409 once the session has ended", async () => {
    const owner = await insertUser(t.db);
    const stranger = await insertUser(t.db);
    const id = await sessionWith(owner.id, [{ user: "hello", reply: "hi" }]);
    await expect(
      loadThreadHistory({ userId: stranger.id, sessionId: id, maxTurns: 12 }, deps()),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await createCoachingSessionsRepo(t.db).endSession({ id, userId: owner.id });
    await expect(
      loadThreadHistory({ userId: owner.id, sessionId: id, maxTurns: 12 }, deps()),
    ).rejects.toMatchObject({ code: "SESSION_ENDED" });
  });
});
