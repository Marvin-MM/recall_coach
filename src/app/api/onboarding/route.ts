import { createOnboardingHandler } from "@/server/api/onboarding";
import { appDeps } from "@/server/container";

export const runtime = "nodejs";
export const maxDuration = 60;

export function POST(request: Request): Promise<Response> {
  return createOnboardingHandler(appDeps())(request);
}
