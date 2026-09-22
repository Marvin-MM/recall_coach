import { env } from "@/env";
import { createHealthHandler } from "@/server/api/health";
import { pingDb } from "@/server/db/client";
import { getMemoryPort } from "@/server/memory/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createHealthHandler({
  pingDb: () => pingDb(),
  memory: getMemoryPort,
  modelId: env.GROQ_MODEL,
});

export function GET(): Promise<Response> {
  return handler();
}
