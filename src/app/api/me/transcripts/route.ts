import { createSettingsHandlers } from "@/server/api/settings";
import { appDeps } from "@/server/container";

export const runtime = "nodejs";

export function DELETE(request: Request): Promise<Response> {
  return createSettingsHandlers(appDeps()).deleteAllTranscripts(request);
}
