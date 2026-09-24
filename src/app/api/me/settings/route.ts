import { createSettingsHandlers } from "@/server/api/settings";
import { appDeps } from "@/server/container";

export const runtime = "nodejs";

export function PATCH(request: Request): Promise<Response> {
  return createSettingsHandlers(appDeps()).patch(request);
}
