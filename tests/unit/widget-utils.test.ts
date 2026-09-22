import { describe, expect, it } from "vitest";
import { readableError } from "@/components/widget/chat-view";
import { conversationToMarkdown } from "@/components/widget/export-conversation";
import { formatWhen, shortBlobId } from "@/components/widget/kind-meta";
import { parseScorecard } from "@/components/widget/scorecard";
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
      readableError(new Error('{"error":{"code":"CONFLICT","message":"This session has ended."}}')),
    ).toEqual({
      message: "This session has ended.",
      ended: true,
    });
    expect(readableError(new Error("stream broke")).message).toBe("stream broke");
  });
});
