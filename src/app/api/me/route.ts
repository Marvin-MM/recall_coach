import { createMeHandler } from "@/server/api/me";
import { appDeps } from "@/server/container";

export const runtime = "nodejs";

export function GET(request: Request): Promise<Response> {
  return createMeHandler(appDeps())(request);
}
