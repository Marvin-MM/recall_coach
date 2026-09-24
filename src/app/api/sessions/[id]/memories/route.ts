import { createSessionsHandlers } from "@/server/api/sessions";
import { appDeps } from "@/server/container";

export const runtime = "nodejs";
// Live recall from Walrus (a few broad queries) can take several seconds on Mainnet.
export const maxDuration = 30;

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: Ctx): Promise<Response> {
  return createSessionsHandlers(appDeps()).memories(request, (await params).id);
}
