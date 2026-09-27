import { describe, expect, it } from "vitest";
import { PERSONAS, PROBE_CATEGORIES, PROBE_QUESTIONS } from "../../scripts/eval/personas";
import { fixKeywords, median, normalize, scoreReply } from "../../scripts/eval/scoring";

describe("eval scoring (deterministic)", () => {
  it("matches keywords case-insensitively with curly quotes normalized", () => {
    expect(normalize("You said “We”")).toBe('you said "we"');
    const s = scoreReply("You keep saying “we” instead of I.", ['"we"', "you personally"]);
    expect(s).toMatchObject({ pass: true, matched: ['"we"'], required: 1 });
    expect(scoreReply("Great answer.", ["metric"]).pass).toBe(false);
    expect(scoreReply("anything", []).pass).toBe(false);
  });

  it("derives assignment keywords from the coach's fix and needs 2 of them", () => {
    const kw = fixKeywords('End with the metric: "cut p95 latency 40%".');
    expect(kw).toEqual(["metric", "latency"]);
    expect(scoreReply("Last time: end with a metric, like the latency drop.", kw, 2).pass).toBe(
      true,
    );
    expect(scoreReply("Add a metric.", kw, 2).pass).toBe(false);
  });

  it("medians", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(3);
  });

  it("probe questions never contain the expected answers", () => {
    for (const p of PERSONAS) {
      for (const c of PROBE_CATEGORIES) {
        if (c === "last_assignment") continue;
        const q = normalize(PROBE_QUESTIONS[c]);
        for (const k of p.expect[c])
          expect(q.includes(normalize(k)), `${p.id}/${c}/${k}`).toBe(false);
      }
    }
  });
});
