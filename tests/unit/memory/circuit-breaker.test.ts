import { describe, expect, it } from "vitest";
import {
  CircuitBreaker,
  CircuitOpenError,
  withCircuitBreaker,
} from "@/server/memory/circuit-breaker";
import { createFakeMemory } from "@/server/memory/fake-memory";

describe("CircuitBreaker", () => {
  const failing = () => Promise.reject(new Error("down"));

  it("opens after 3 consecutive failures and short-circuits for 30 s", async () => {
    let t = 0;
    const b = new CircuitBreaker({ now: () => t });
    for (let i = 0; i < 3; i++) await expect(b.exec(failing)).rejects.toThrow("down");
    expect(b.state).toBe("open");
    let called = false;
    await expect(
      b.exec(async () => {
        called = true;
      }),
    ).rejects.toBeInstanceOf(CircuitOpenError);
    expect(called).toBe(false);
    t = 29_999;
    expect(b.state).toBe("open");
    t = 30_000;
    expect(b.state).toBe("half-open");
  });

  it("a successful half-open trial closes it; a failed one re-opens", async () => {
    let t = 0;
    const b = new CircuitBreaker({ now: () => t, failureThreshold: 1, openMs: 10 });
    await expect(b.exec(failing)).rejects.toThrow();
    t = 10;
    await expect(b.exec(failing)).rejects.toThrow("down");
    expect(b.state).toBe("open");
    t = 20;
    await expect(b.exec(async () => "ok")).resolves.toBe("ok");
    expect(b.state).toBe("closed");
  });

  it("a success resets the consecutive-failure count", async () => {
    const b = new CircuitBreaker();
    await expect(b.exec(failing)).rejects.toThrow();
    await expect(b.exec(failing)).rejects.toThrow();
    await b.exec(async () => 1);
    await expect(b.exec(failing)).rejects.toThrow();
    expect(b.state).toBe("closed");
  });

  it("only lets one half-open trial through at a time", async () => {
    let t = 0;
    const b = new CircuitBreaker({ now: () => t, failureThreshold: 1, openMs: 5 });
    await expect(b.exec(failing)).rejects.toThrow();
    t = 5;
    let release: () => void = () => {};
    const trial = b.exec(
      () =>
        new Promise<void>((r) => {
          release = r;
        }),
    );
    await expect(b.exec(async () => 1)).rejects.toBeInstanceOf(CircuitOpenError);
    release();
    await trial;
    expect(b.state).toBe("closed");
  });

  it("wrapped port: recall fails fast while open; health reports the state", async () => {
    const fake = createFakeMemory({ failRecall: "unavailable" });
    const b = new CircuitBreaker({ failureThreshold: 2 });
    const port = withCircuitBreaker(fake, b);
    const args = { namespace: "n", query: "q", limit: 1 };
    await expect(port.recall(args)).rejects.toThrow();
    await expect(port.recall(args)).rejects.toThrow();
    await expect(port.recall(args)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fake.calls.recall).toHaveLength(2);
    expect((await port.health()).ok).toBe(false);
  });
});
