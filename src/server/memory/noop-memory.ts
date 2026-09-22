import type { MemoryPort } from "./memory-port";

/** Amnesia Mode: recalls nothing, stores nothing. */
export const noopMemory: MemoryPort = {
  driver: "noop",
  recall: async () => [],
  rememberMany: async () => [],
  jobStatuses: async (jobIds) => jobIds.map((jobId) => ({ jobId, state: "unknown" as const })),
  health: async () => ({ ok: true, version: "noop" }),
};
