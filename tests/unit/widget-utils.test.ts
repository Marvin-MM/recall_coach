import { describe, expect, it } from "vitest";
import { readableError } from "@/components/widget/chat-view";
import { conversationToMarkdown } from "@/components/widget/export-conversation";
import { formatWhen, shortBlobId } from "@/components/widget/kind-meta";
import { parseScorecard } from "@/components/widget/scorecard";
import {
  buildClientHistory,
  latestNextSeq,
  transcriptToUiMessages,
} from "@/components/widget/thread-utils";
import type { CoachUIMessage } from "@/types/chat";

describe("parseScorecard", () => {
  it("extracts scores and the fix line from the rubric format", () => {
    const card = parseScorecard(
      "**Scorecard** — Structure 3/5 · Specificity 2/5 · Impact 1/5 · Communication 4/5\nGood start.\n**Fix next time:** End with the metric.",
    );
    expect(card).toEqual({
      scores: { Structure: 3, Specificity: 2, Impact: 1, Communication: 4 },
      fix: "End with the metric.",
    });
  });

  it("returns null for normal replies", () => {
    expect(parseScorecard("Tell me about a time you led a project.")).toBeNull();
  });

  it("ignores out-of-range scores", () => {
    expect(parseScorecard("Structure 9/5 · Impact 0/5")).toBeNull();
  });
});

describe("conversationToMarkdown", () => {
  it("exports text and recalled memories, skipping empty messages", () => {
    const messages: CoachUIMessage[] = [
      { id: "1", role: "user", parts: [{ type: "text", text: "Quiz me" }] },
      {
        id: "2",
        role: "assistant",
        parts: [
          {
            type: "data-memory",
            data: {
              recalled: [
                { blobId: "abc", kind: "mistake", snippet: "Skipped the Result", at: null },
              ],
              degraded: false,
              reason: null,
              amnesia: false,
            },
          },
          { type: "text", text: "Here is a question." },
        ],
      },
      { id: "3", role: "assistant", parts: [] },
    ];
    const md = conversationToMarkdown({
      title: "Drill · 22 Sep",
      memoryEnabled: true,
      messages,
      exportedAt: new Date("2026-09-22T10:00:00Z"),
    });
    expect(md).toContain("# Drill · 22 Sep");
    expect(md).toContain("## You\n\nQuiz me");
    expect(md).toContain("> - (mistake) Skipped the Result — blob `abc`");
    expect(md.match(/## Coach/g)).toHaveLength(1);
  });
});

describe("widget helpers", () => {
  it("shortens blob ids", () => {
    expect(shortBlobId("A9CYr7Ob_XX-ln3mri25McD_o6cJfPW-8RS9KQdzY3M")).toBe("A9CYr7…zY3M");
    expect(shortBlobId("short")).toBe("short");
  });

  it("formats relative dates", () => {
    const now = new Date("2026-09-24T12:00:00Z");
    expect(formatWhen("2026-09-24T08:00:00Z", now)).toBe("today");
    expect(formatWhen("2026-09-23T08:00:00Z", now)).toBe("yesterday");
    expect(formatWhen("2026-09-20T08:00:00Z", now)).toBe("4 days ago");
    expect(formatWhen(null, now)).toBe("");
  });

  it("reads server JSON errors and flags ended sessions", () => {
    expect(
      readableError(
        new Error('{"error":{"code":"SESSION_ENDED","message":"This session has ended."}}'),
      ),
    ).toEqual({ message: "This session has ended.", code: "SESSION_ENDED", ended: true });
    expect(
      readableError(new Error('{"error":{"code":"SESSION_IDLE","message":"Ended after 2 hours."}}'))
        .ended,
    ).toBe(true);
    expect(
      readableError(new Error('{"error":{"code":"STALE_THREAD","message":"Reloading."}}')),
    ).toMatchObject({ code: "STALE_THREAD", ended: false });
    expect(readableError(new Error("stream broke")).message).toBe("stream broke");
  });
});

const ui = (
  id: string,
  role: "user" | "assistant",
  text: string,
  metadata?: CoachUIMessage["metadata"],
): CoachUIMessage => ({
  id,
  role,
  parts: text ? [{ type: "text", text }] : [],
  ...(metadata ? { metadata } : {}),
});

describe("thread helpers (history on/off)", () => {
  it("buildClientHistory keeps only completed exchanges, alternating and ending with a reply", () => {
    const history = buildClientHistory([
      ui("1", "user", "q1"),
      ui("2", "assistant", "a1"),
      ui("3", "user", "unanswered (request failed)"),
      ui("4", "user", "q2"),
      ui("5", "assistant", "", { status: "failed" }),
      ui("6", "user", "q3"),
      ui("7", "assistant", "a3"),
    ]);
    expect(history).toEqual([
      { role: "user", text: "q1" },
      { role: "assistant", text: "a1" },
      { role: "user", text: "q3" },
      { role: "assistant", text: "a3" },
    ]);
  });

  it("buildClientHistory caps at 24 messages (the newest 12 exchanges) and 4000 chars each", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      ui(`m${i}`, i % 2 === 0 ? "user" : "assistant", `${i}:${"x".repeat(5000)}`),
    );
    const history = buildClientHistory(many);
    expect(history).toHaveLength(24);
    expect(history[0]?.text.startsWith("16:")).toBe(true);
    expect(history.every((m) => m.text.length <= 4000)).toBe(true);
  });

  it("transcriptToUiMessages keeps seq/status; latestNextSeq reads the newest server seq", () => {
    const msgs = transcriptToUiMessages([
      { seq: 0, role: "user", text: "hi", status: "ok", createdAt: "2026-09-22T10:00:00.000Z" },
      {
        seq: 1,
        role: "assistant",
        text: "",
        status: "failed",
        createdAt: "2026-09-22T10:00:01.000Z",
      },
    ]);
    expect(msgs.map((m) => [m.id, m.metadata?.status, m.parts.length])).toEqual([
      ["seq-0", "ok", 1],
      ["seq-1", "failed", 0],
    ]);
    expect(latestNextSeq(msgs)).toBeUndefined();
    expect(latestNextSeq([...msgs, ui("a", "assistant", "ok", { nextSeq: 4 })])).toBe(4);
  });
});
