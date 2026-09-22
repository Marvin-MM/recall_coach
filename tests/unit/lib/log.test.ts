import { describe, expect, it, vi } from "vitest";
import { log, REDACTED, redact } from "@/lib/log";

describe("redact", () => {
  it("redacts secret-looking keys recursively", () => {
    const out = redact({
      apiKey: "gsk_x",
      nested: {
        MEMWAL_PRIVATE_KEY: "abc",
        headers: { authorization: "Bearer x", cookie: "c" },
        ok: 1,
      },
      list: [{ token: "t" }],
      clientSecret: "s",
    });
    expect(out).toEqual({
      apiKey: REDACTED,
      nested: {
        MEMWAL_PRIVATE_KEY: REDACTED,
        headers: { authorization: REDACTED, cookie: REDACTED },
        ok: 1,
      },
      list: [{ token: REDACTED }],
      clientSecret: REDACTED,
    });
  });

  it("serializes errors without stacks and handles cycles", () => {
    const a: Record<string, unknown> = { e: Object.assign(new Error("x"), { code: "E1" }) };
    a.self = a;
    const out = redact(a) as Record<string, unknown>;
    expect(out.e).toEqual({ name: "Error", message: "x", code: "E1" });
    expect(out.self).toBe("[Circular]");
  });

  it("emits one JSON line with the event name", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    log.error("memory.auth_error", { secret: "nope", userId: "u1" });
    const line = JSON.parse(String(spy.mock.calls[0]?.[0]));
    expect(line).toMatchObject({
      level: "error",
      event: "memory.auth_error",
      secret: REDACTED,
      userId: "u1",
    });
    spy.mockRestore();
  });
});
