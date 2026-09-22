import { createMemoryInspectorHandler } from "@/server/api/memory-inspector";
import { appDeps } from "@/server/container";

export const runtime = "nodejs";
export const maxDuration = 30;

let handler: ((request: Request) => Promise<Response>) | undefined;

export function GET(request: Request): Promise<Response> {
  // Module-level handler keeps the 30 s per-user cache across requests.
  handler ??= createMemoryInspectorHandler(appDeps());
  return handler(request);
}
