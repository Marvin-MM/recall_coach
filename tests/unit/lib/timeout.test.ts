import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryTimeoutError, OperationTimeoutError } from "@/lib/errors";
import { withTimeout } from "@/lib/timeout";

describe("withTimeout", () => {
  afterEach(() => vi.useRealTimers());

  it("resolves when the promise wins", async () => {
    await expect(withTimeout(Promise.resolve(42), 100, "x")).resolves.toBe(42);
  });

  it("rejects with OperationTimeoutError and aborts the controller", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const p = withTimeout(new Promise(() => {}), 50, "slow", { controller });
    vi.advanceTimersByTime(51);
    await expect(p).rejects.toBeInstanceOf(OperationTimeoutError);
    expect(controller.signal.aborted).toBe(true);
  });

  it("uses a custom error factory", async () => {
    vi.useFakeTimers();
    const p = withTimeout(new Promise(() => {}), 10, "recall", {
      makeError: (l, ms) => new MemoryTimeoutError(l, ms),
    });
    vi.advanceTimersByTime(11);
    await expect(p).rejects.toBeInstanceOf(MemoryTimeoutError);
  });

  it("propagates the original rejection", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 100, "x")).rejects.toThrow("boom");
  });

  it("clears the timer once settled", async () => {
    vi.useFakeTimers();
    await withTimeout(Promise.resolve(1), 1000, "x");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects invalid durations", async () => {
    await expect(withTimeout(Promise.resolve(1), 0, "x")).rejects.toBeInstanceOf(RangeError);
  });
});
