import { describe, expect, it } from "vitest";
import { decodeMemory, encodeProfile } from "@/server/memory/memory-format";
import { mergeProfile, profileChanged, selectLatestProfile } from "@/server/memory/profile";
import type { RecalledMemory } from "@/types/memory";

const mem = (text: string, blobId: string): RecalledMemory => ({
  blobId,
  text,
  distance: 0.3,
  decoded: decodeMemory(text),
});

describe("selectLatestProfile", () => {
  it("picks the snapshot with the newest header timestamp regardless of rank", () => {
    const older = encodeProfile({
      profile: { targetRole: "PM" },
      at: new Date("2026-09-01T00:00:00Z"),
    });
    const newer = encodeProfile({
      profile: { targetRole: "Backend Engineer" },
      at: new Date("2026-09-20T00:00:00Z"),
    });
    const picked = selectLatestProfile([mem(older, "b1"), mem(newer, "b2")]);
    expect(picked?.profile.targetRole).toBe("Backend Engineer");
    expect(picked?.blobId).toBe("b2");
  });

  it("ignores malformed and non-profile lines", () => {
    const good = encodeProfile({
      profile: { company: "Stripe" },
      at: new Date("2026-09-01T00:00:00Z"),
    });
    const picked = selectLatestProfile([
      mem("[kind=profile][at=2026-12-01T00:00:00Z][v=1] {broken", "x"),
      mem("[kind=goal][at=2026-12-01T00:00:00Z] a goal", "y"),
      mem("random text", "z"),
      mem(good, "ok"),
    ]);
    expect(picked?.blobId).toBe("ok");
  });

  it("returns null when nothing usable", () => {
    expect(selectLatestProfile([])).toBeNull();
  });
});

describe("mergeProfile", () => {
  it("present fields replace, absent fields keep", () => {
    expect(
      mergeProfile(
        { targetRole: "PM", company: "Acme", level: "mid" },
        { company: "Stripe", learningStyle: "socratic, concise" },
      ),
    ).toEqual({
      targetRole: "PM",
      company: "Stripe",
      level: "mid",
      learningStyle: "socratic, concise",
    });
  });

  it("ignores empty strings and dedupes/caps focus areas", () => {
    const merged = mergeProfile(
      { focusAreas: ["old"] },
      { targetRole: "  ", focusAreas: ["STAR", "star", "System design", "a", "b", "c", "d"] },
    );
    expect(merged.targetRole).toBeUndefined();
    expect(merged.focusAreas).toEqual(["STAR", "System design", "a", "b", "c"]);
  });

  it("handles null current / null update", () => {
    expect(mergeProfile(null, null)).toEqual({});
    expect(mergeProfile(null, { level: "senior" })).toEqual({ level: "senior" });
  });

  it("profileChanged detects real changes only", () => {
    expect(profileChanged({ level: "mid" }, { level: "mid" })).toBe(false);
    expect(profileChanged({ level: "mid" }, { level: "senior" })).toBe(true);
    expect(profileChanged(null, {})).toBe(false);
  });
});
