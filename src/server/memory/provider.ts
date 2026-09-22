import "server-only";
import { env } from "@/env";
import { CircuitBreaker, withCircuitBreaker } from "./circuit-breaker";
import { createFakeMemory, type FakeMemoryPort } from "./fake-memory";
import type { MemoryPort } from "./memory-port";
import { createMemWalPort, getMemWalClient } from "./memwal-adapter";
import { noopMemory } from "./noop-memory";

const globalForMemory = globalThis as unknown as {
  __recallMemory?: MemoryPort | undefined;
  __recallFakeMemory?: FakeMemoryPort | undefined;
};

/** Process-wide memory port (memoized per warm instance). */
export function getMemoryPort(): MemoryPort {
  if (globalForMemory.__recallMemory) return globalForMemory.__recallMemory;
  let port: MemoryPort;
  if (env.MEMORY_DRIVER === "fake") {
    // Test-only (rejected in production by env validation).
    globalForMemory.__recallFakeMemory ??= createFakeMemory();
    port = globalForMemory.__recallFakeMemory;
  } else {
    const client = getMemWalClient({
      key: env.MEMWAL_PRIVATE_KEY,
      accountId: env.MEMWAL_ACCOUNT_ID,
      serverUrl: env.MEMWAL_SERVER_URL,
      requestTimeoutMs: env.MEMWAL_SAVE_TIMEOUT_MS,
    });
    port = withCircuitBreaker(
      createMemWalPort(client, {
        recallTimeoutMs: env.MEMWAL_RECALL_TIMEOUT_MS,
        saveTimeoutMs: env.MEMWAL_SAVE_TIMEOUT_MS,
      }),
      new CircuitBreaker({ failureThreshold: 3, openMs: 30_000 }),
    );
  }
  globalForMemory.__recallMemory = port;
  return port;
}

/** Amnesia Mode sessions get the noop port: nothing recalled, nothing saved. */
export function memoryForSession(memoryEnabled: boolean): MemoryPort {
  return memoryEnabled ? getMemoryPort() : noopMemory;
}
