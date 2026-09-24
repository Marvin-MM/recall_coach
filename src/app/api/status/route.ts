import { healthHandler } from "@/server/health-instance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** UI status badges: same body as /api/health, always 200 (the UI shows "degraded" itself). */
export function GET(): Promise<Response> {
  return healthHandler()("status");
}
