import { MemWalMock } from "@mysten-incubation/memwal";
import { describe, expect, it, vi } from "vitest";
import {
  MemoryAuthError,
  MemoryCompatibilityError,
  MemoryTimeoutError,
  MemoryUnavailableError,
} from "@/lib/errors";
import { classifyMemoryError } from "@/server/memory/errors";
import { encodeFact } from "@/server/memory/memory-format";
import {
  createMemWalPort,
  isTransientJobError,
  type MemWalLike,
} from "@/server/memory/memwal-adapter";

const cfg = { recallTimeoutMs: 1000, saveTimeoutMs: 5000, pollIntervalMs: 1 };

describe("createMemWalPort with the SDK's MemWalMock", () => {
  it("round-trips remember → recall and decodes typed lines", async () => {
    const port = createMemWalPort(MemWalMock.create(), cfg);
    const line = encodeFact({
      kind: "mistake",
      text: "The user skipped the Result.",
      at: new Date("2026-09-22T10:00:00Z"),
    });
    const accepted: string[] = [];
    const outcomes = await port.rememberMany({
      namespace: "ns-a",
      texts: [line],
      onAccepted: async (jobs) => {
        accepted.push(...jobs.map((j) => j.jobId));
      },
    });
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.ok).toBe(true);
    expect(accepted).toHaveLength(1);
    const hits = await port.recall({ namespace: "ns-a", query: "skipped the Result", limit: 5 });
    expect(hits[0]?.decoded?.kind).toBe("mistake");
    expect(hits[0]?.blobId).toBe(outcomes[0]?.ok ? outcomes[0].blobId : "");
  });

  it("keeps namespaces isolated", async () => {
    const port = createMemWalPort(MemWalMock.create(), cfg);
    await port.rememberMany({ namespace: "ns-a", texts: ["alpha fact about STAR"] });
    expect(
      await port.recall({ namespace: "ns-b", query: "alpha fact about STAR", limit: 5 }),
    ).toEqual([]);
  });

  it("returns [] for an empty query without calling the SDK", async () => {
    const client = MemWalMock.create();
    const spy = vi.spyOn(client, "recall");
    const port = createMemWalPort(client, cfg);
    expect(await port.recall({ namespace: "n", query: "   ", limit: 3 })).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("chunks bulk writes at 20 items and keeps input order", async () => {
    const client = MemWalMock.create();
    const spy = vi.spyOn(client, "rememberBulkAsync");
    const port = createMemWalPort(client, cfg);
    const texts = Array.from({ length: 23 }, (_, i) => `fact number ${i}`);
    const outcomes = await port.rememberMany({ namespace: "n", texts });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0]?.[0]).toHaveLength(20);
    expect(outcomes.map((o) => o.index)).toEqual(texts.map((_, i) => i));
    expect(outcomes.every((o) => o.ok)).toBe(true);
  });

  it("reports job statuses for reconciliation", async () => {
    const client = MemWalMock.create();
    const port = createMemWalPort(client, cfg);
    const [o] = await port.rememberMany({ namespace: "n", texts: ["x fact"] });
    const statuses = await port.jobStatuses([o?.jobId ?? "", "missing-job"]);
    expect(statuses[0]).toMatchObject({ state: "done" });
    expect(statuses[1]).toEqual({ jobId: "missing-job", state: "unknown" });
  });
});

describe("createMemWalPort failure mapping", () => {
  const base: MemWalLike = {
    recall: async () => ({ results: [], total: 0 }),
    rememberBulkAsync: async (items) => ({
      job_ids: items.map((_, i) => `job-${i}`),
      total: items.length,
      status: "accepted",
    }),
    waitForRememberJobs: async (ids) => ({
      results: ids.map((id) => ({
        id,
        blob_id: `blob-${id}`,
        status: "done" as const,
        namespace: "n",
      })),
      total: ids.length,
      succeeded: ids.length,
      failed: 0,
    }),
    getRememberBulkStatus: async () => ({ results: [] }),
    health: async () => ({ status: "ok", version: "0.1.0" }),
  };

  it("times out recall with MemoryTimeoutError", async () => {
    const port = createMemWalPort(
      { ...base, recall: () => new Promise(() => {}) },
      { ...cfg, recallTimeoutMs: 20 },
    );
    await expect(port.recall({ namespace: "n", query: "q", limit: 1 })).rejects.toBeInstanceOf(
      MemoryTimeoutError,
    );
  });

  it("maps 401 to MemoryAuthError", async () => {
    const port = createMemWalPort(
      {
        ...base,
        recall: async () =>
          Promise.reject(Object.assign(new Error("delegate key not registered"), { status: 401 })),
      },
      cfg,
    );
    await expect(port.recall({ namespace: "n", query: "q", limit: 1 })).rejects.toBeInstanceOf(
      MemoryAuthError,
    );
  });

  it("maps partial job failures, missing blob ids and timeouts per item", async () => {
    const port = createMemWalPort(
      {
        ...base,
        waitForRememberJobs: async (ids) => ({
          results: [
            { id: ids[0] ?? "", blob_id: "b0", status: "done", namespace: "n" },
            { id: ids[1] ?? "", blob_id: "", status: "done", namespace: "n" },
            { id: ids[2] ?? "", blob_id: "", status: "failed", namespace: "n", error: "boom" },
            { id: ids[3] ?? "", blob_id: "", status: "timeout", namespace: "n" },
          ],
          total: 4,
          succeeded: 2,
          failed: 2,
        }),
      },
      cfg,
    );
    const out = await port.rememberMany({ namespace: "n", texts: ["a", "b", "c", "d"] });
    expect(out.map((o) => (o.ok ? "ok" : o.errorCode))).toEqual([
      "ok",
      "MISSING_BLOB_ID",
      "JOB_FAILED",
      "MEMORY_TIMEOUT",
    ]);
  });

  it("throws (retryable) when nothing was accepted", async () => {
    const port = createMemWalPort(
      {
        ...base,
        rememberBulkAsync: async () =>
          Promise.reject(Object.assign(new Error("bad gateway"), { status: 502 })),
      },
      cfg,
    );
    await expect(port.rememberMany({ namespace: "n", texts: ["a"] })).rejects.toBeInstanceOf(
      MemoryUnavailableError,
    );
  });

  it("health reports version and failures", async () => {
    expect(await createMemWalPort(base, cfg).health()).toEqual({ ok: true, version: "0.1.0" });
    const down = createMemWalPort(
      { ...base, health: async () => Promise.reject(new TypeError("fetch failed")) },
      cfg,
    );
    expect(await down.health()).toEqual({ ok: false, reason: "MEMORY_UNAVAILABLE" });
  });
});

describe("classifyMemoryError", () => {
  it.each([
    [
      Object.assign(new Error("x"), { name: "MemWalCompatibilityError" }),
      MemoryCompatibilityError,
      false,
    ],
    [Object.assign(new Error("x"), { status: 403 }), MemoryAuthError, false],
    [
      Object.assign(new Error("x"), { status: 401, serverCode: "ERR_TIMESTAMP_OUT_OF_BOUNDS" }),
      MemoryAuthError,
      false,
    ],
    [
      Object.assign(new Error("x"), { status: 504, name: "MemWalRequestTimeout" }),
      MemoryTimeoutError,
      true,
    ],
    [Object.assign(new Error("x"), { status: 429 }), MemoryUnavailableError, true],
    [Object.assign(new Error("x"), { status: 503 }), MemoryUnavailableError, true],
    [new TypeError("fetch failed"), MemoryUnavailableError, true],
    [Object.assign(new Error("bad input"), { status: 400 }), MemoryUnavailableError, false],
  ])("classifies %o", (raw, type, transient) => {
    const c = classifyMemoryError(raw);
    expect(c.error).toBeInstanceOf(type);
    expect(c.transient).toBe(transient);
  });
});

describe("isTransientJobError", () => {
  it.each([
    [
      "Internal Error: seal encrypt failed: seal/encrypt failed during read_account_identity: RpcError: Too Many Requests (traceId=x, timeoutMs=25000)",
      true,
    ],
    ["upstream returned 503", true],
    ["walrus upload timed out", true],
    ["invalid namespace", false],
    [undefined, false],
  ])("%s → %s", (msg, expected) => {
    expect(isTransientJobError(msg)).toBe(expected);
  });
});
