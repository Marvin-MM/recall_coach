import { describe, expect, it } from "vitest";
import { InvalidNamespaceError } from "@/lib/errors";
import { deriveNamespaces } from "@/server/memory/namespace";

const UUID = "3f2b9c1e-8a4d-4f6b-9c2e-1a2b3c4d5e6f";

describe("deriveNamespaces", () => {
  it("is deterministic", () => {
    expect(deriveNamespaces(UUID, 1, "coach-v1")).toEqual(deriveNamespaces(UUID, 1, "coach-v1"));
  });

  it("builds facts and profile namespaces from the prefix", () => {
    expect(deriveNamespaces("abc123", 1, "coach-v1")).toEqual({
      facts: "coach-v1-abc123",
      profile: "coach-v1-abc123-profile",
    });
  });

  it("normalizes to lowercase", () => {
    expect(deriveNamespaces("ABC123", 1, "coach-v1").facts).toBe("coach-v1-abc123");
  });

  it("gives distinct users distinct namespaces", () => {
    const a = deriveNamespaces("user-a", 1, "coach-v1");
    const b = deriveNamespaces("user-b", 1, "coach-v1");
    expect(a.facts).not.toBe(b.facts);
    expect(a.profile).not.toBe(b.profile);
    // a user's facts namespace can never equal another user's profile namespace
    expect(deriveNamespaces("x", 1, "p").facts).not.toBe(
      deriveNamespaces("x-profile", 1, "p").profile,
    );
  });

  it("documents the case-collision trade-off (ids are issued lowercase)", () => {
    expect(deriveNamespaces("AbC", 1, "p").facts).toBe(deriveNamespaces("abc", 1, "p").facts);
  });

  it("appends a version suffix for v2+", () => {
    expect(deriveNamespaces("abc", 2, "coach-v1").facts).toBe("coach-v1-abc-v2");
  });

  it.each([
    ["empty", ""],
    ["path traversal", "../other-user"],
    ["slash", "a/b"],
    ["wildcard", "*"],
    ["glob", "user*"],
    ["whitespace", "user 1"],
    ["tab", "user\t1"],
    ["newline", "user\n1"],
    ["unicode", "usér"],
    ["emoji", "user😀"],
    ["cyrillic lookalike", "usеr"],
    ["underscore", "user_1"],
    ["dot", "user.1"],
    ["leading hyphen", "-user"],
    ["trailing hyphen", "user-"],
    ["null byte", "user\u0000"],
    ["overlong", "a".repeat(65)],
  ])("rejects %s", (_label, input) => {
    expect(() => deriveNamespaces(input, 1, "coach-v1")).toThrow(InvalidNamespaceError);
  });

  it("accepts a Better Auth UUID id", () => {
    expect(deriveNamespaces(UUID, 1, "coach-v1").facts).toBe(`coach-v1-${UUID}`);
  });

  it("rejects invalid prefixes and versions", () => {
    expect(() => deriveNamespaces("abc", 1, "Bad Prefix")).toThrow(InvalidNamespaceError);
    expect(() => deriveNamespaces("abc", 0, "p")).toThrow(InvalidNamespaceError);
    expect(() => deriveNamespaces("abc", 1.5, "p")).toThrow(InvalidNamespaceError);
  });
});
