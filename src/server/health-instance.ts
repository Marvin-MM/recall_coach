import "server-only";
import { env } from "@/env";
import { createHealthHandler } from "./api/health";
import { pingDb } from "./db/client";
import { getMemoryPort } from "./memory/provider";

let handler: ReturnType<typeof createHealthHandler> | undefined;

/** One handler (one cache, one in-flight probe) shared by /api/health and /api/status. */
export function healthHandler(): ReturnType<typeof createHealthHandler> {
  handler ??= createHealthHandler({
    pingDb: () => pingDb(),
    memory: getMemoryPort,
    modelId: env.GROQ_MODEL,
  });
  return handler;
}
