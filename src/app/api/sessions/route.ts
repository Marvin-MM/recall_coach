import { createSessionsHandlers } from "@/server/api/sessions";
import { appDeps } from "@/server/container";

export const runtime = "nodejs";

export function GET(request: Request): Promise<Response> {
  return createSessionsHandlers(appDeps()).list(request);
}

export function POST(request: Request): Promise<Response> {
  return createSessionsHandlers(appDeps()).create(request);
}
