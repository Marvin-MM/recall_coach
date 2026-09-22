import { createEvidenceHandler } from "@/server/api/evidence";
import { appDeps } from "@/server/container";
import { memwalIdentity } from "@/server/memory/identity";

export const runtime = "nodejs";

export function GET(request: Request): Promise<Response> {
  const deps = appDeps();
  return createEvidenceHandler({ ...deps, identity: memwalIdentity })(request);
}
