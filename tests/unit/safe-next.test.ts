import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-next";

describe("safeNextPath", () => {
  it.each(["/coach", "/coach/", "/admin/evidence"])("accepts %s", (p) => {
    expect(safeNextPath(p)).toBe(p);
  });

  it("drops query strings and fragments", () => {
    expect(safeNextPath("/admin/evidence?x=1#y")).toBe("/admin/evidence");
  });

  it.each([
    null,
    "",
    "https://evil.example/coach",
    "//evil.example/coach",
    "/\\evil.example",
    "javascript:alert(1)",
    "/admin/login",
    "/api/me",
    "/coachx",
    `/coach/${"a".repeat(300)}`,
  ])("rejects %s", (p) => {
    expect(safeNextPath(p)).toBeNull();
  });
});
