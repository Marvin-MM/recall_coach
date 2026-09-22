import { describe, expect, it } from "vitest";
import {
  canonical,
  dedupeAgainst,
  isNearDuplicate,
  levenshtein,
  similarity,
} from "@/server/memory/dedup";

describe("dedup", () => {
  it("levenshtein basics", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("same", "same")).toBe(0);
  });

  it("canonical form ignores case, punctuation and memory headers", () => {
    expect(canonical("[kind=mistake][at=2026-01-01T00:00:00Z]  The User, skipped!")).toBe(
      "the user skipped",
    );
  });

  it("treats near-identical facts as duplicates (≥0.9)", () => {
    const a = "The user skipped the Result in a STAR answer.";
    const b = "The user skipped the result in a STAR answer";
    expect(similarity(a, b)).toBeGreaterThanOrEqual(0.9);
    expect(isNearDuplicate(b, [a])).toBe(true);
  });

  it("keeps genuinely different facts", () => {
    expect(
      isNearDuplicate("The user gave strong metrics.", [
        "The user skipped the Result in a STAR answer.",
      ]),
    ).toBe(false);
  });

  it("dedupes against existing memories and within the batch", () => {
    const { kept, dropped } = dedupeAgainst(
      ["Fact A about STAR results.", "fact a about star results", "Fact B about system design."],
      ["[kind=goal][at=2026-01-01T00:00:00Z] Fact B about system design"],
      (s) => s,
    );
    expect(kept).toEqual(["Fact A about STAR results."]);
    expect(dropped).toBe(2);
  });
});
