import { describe, expect, it } from "vitest";
import { extractMemories, normalizeExtraction } from "@/server/llm/extraction";
import { createFakeModelFactory } from "@/server/llm/fake-model";

const nullProfile = {
  targetRole: null,
  company: null,
  level: null,
  interviewDate: null,
  learningStyle: null,
  focusAreas: null,
};

describe("normalizeExtraction", () => {
  it("clips to 5 facts, drops tiny ones and normalizes whitespace", () => {
    const r = normalizeExtraction({
      facts: [
        { kind: "goal", text: "ok" },
        ...Array.from({ length: 7 }, (_, i) => ({
          kind: "mistake" as const,
          text: `The user  made mistake ${i}`,
        })),
      ],
      profileUpdate: null,
    });
    expect(r.facts).toHaveLength(5);
    expect(r.facts[0]?.text).toBe("The user made mistake 0");
  });

  it("keeps valid profile fields and drops invalid ones individually", () => {
    const r = normalizeExtraction({
      facts: [],
      profileUpdate: {
        ...nullProfile,
        targetRole: "Data Scientist",
        interviewDate: "next tuesday",
        focusAreas: ["SQL", "stats", "a", "b", "c", "d"],
      },
    });
    expect(r.profileUpdate).toEqual({
      targetRole: "Data Scientist",
      focusAreas: ["SQL", "stats", "a", "b", "c"],
    });
  });

  it("returns null profileUpdate when every field is null/empty", () => {
    expect(
      normalizeExtraction({ facts: [], profileUpdate: { ...nullProfile, company: " " } })
        .profileUpdate,
    ).toBeNull();
  });
});

describe("extractMemories (structured output via mock model)", () => {
  it("parses the model's JSON", async () => {
    const models = createFakeModelFactory({
      extractionJson: JSON.stringify({
        facts: [{ kind: "strength", text: "The user quantified impact clearly." }],
        profileUpdate: null,
      }),
    });
    const r = await extractMemories({
      model: models.extractionModel(),
      lastUserText: "u",
      assistantText: "a",
      profile: null,
      knownMistakes: [],
      now: new Date(),
    });
    expect(r.facts).toEqual([{ kind: "strength", text: "The user quantified impact clearly." }]);
  });

  it("wraps invalid output in LlmError", async () => {
    const models = createFakeModelFactory({ extractionJson: "not json" });
    await expect(
      extractMemories({
        model: models.extractionModel(),
        lastUserText: "u",
        assistantText: "a",
        profile: null,
        knownMistakes: [],
        now: new Date(),
      }),
    ).rejects.toMatchObject({ code: "LLM_EXTRACTION_FAILED" });
  });
});
