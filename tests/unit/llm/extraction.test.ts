import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  extractionWireSchema,
  extractMemories,
  normalizeExtraction,
} from "@/server/llm/extraction";
import { createFakeModelFactory } from "@/server/llm/fake-model";
import { MEMORY_TAGS } from "@/server/memory/tags";

const nullProfile = {
  targetRole: null,
  company: null,
  level: null,
  interviewDate: null,
  learningStyle: null,
  focusAreas: null,
};

const noAssignment = { assignmentTag: null, assignmentCompleted: false };

describe("normalizeExtraction", () => {
  it("clips to 5 facts, drops tiny ones and normalizes whitespace", () => {
    const r = normalizeExtraction({
      facts: [
        { kind: "goal", tag: "other", text: "ok" },
        ...Array.from({ length: 7 }, (_, i) => ({
          kind: "mistake" as const,
          tag: "structure" as const,
          text: `The user  made mistake ${i}`,
        })),
      ],
      profileUpdate: null,
      ...noAssignment,
    });
    expect(r.facts).toHaveLength(5);
    expect(r.facts[0]?.text).toBe("The user made mistake 0");
  });

  it("keeps valid profile fields and drops invalid ones individually", () => {
    const r = normalizeExtraction({
      facts: [],
      ...noAssignment,
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
      normalizeExtraction({
        facts: [],
        ...noAssignment,
        profileUpdate: { ...nullProfile, company: " " },
      }).profileUpdate,
    ).toBeNull();
  });
});

describe("extractMemories (structured output via mock model)", () => {
  it("parses the model's JSON", async () => {
    const models = createFakeModelFactory({
      extractionJson: JSON.stringify({
        facts: [{ kind: "strength", tag: "impact", text: "The user quantified impact clearly." }],
        assignmentTag: "impact",
        assignmentCompleted: false,
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
    expect(r.facts).toEqual([
      { kind: "strength", tag: "impact", text: "The user quantified impact clearly." },
    ]);
    expect(r).toMatchObject({ assignmentTag: "impact", assignmentCompleted: false });
  });

  it("rejects tags outside the controlled vocabulary", () => {
    const parsed = extractionWireSchema.safeParse({
      facts: [{ kind: "mistake", tag: "rambling", text: "The user rambled on." }],
      profileUpdate: null,
      ...noAssignment,
    });
    expect(parsed.success).toBe(false);
  });

  it("sends a strict JSON schema: every property required, tags as an enum incl. other", () => {
    const schema = z.toJSONSchema(extractionWireSchema) as unknown as {
      required: string[];
      properties: { facts: { items: { properties: { tag: { enum: string[] } } } } };
    };
    expect(schema.required.sort()).toEqual(
      ["assignmentCompleted", "assignmentTag", "facts", "profileUpdate"].sort(),
    );
    expect(schema.properties.facts.items.properties.tag.enum).toEqual([...MEMORY_TAGS]);
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
