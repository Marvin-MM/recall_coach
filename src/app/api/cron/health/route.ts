import { env } from "@/env";
import { createCronHealthHandler } from "@/server/api/cron";
import { appDeps } from "@/server/container";

export const runtime = "nodejs";
export const maxDuration = 60;

export function GET(request: Request): Promise<Response> {
  const deps = appDeps();
  return createCronHealthHandler({ ...deps, cronSecret: env.CRON_SECRET })(request);
}
