import { createSessionsHandlers } from "@/server/api/sessions";
import { appDeps } from "@/server/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: Ctx): Promise<Response> {
  return createSessionsHandlers(appDeps()).previousSaves(request, (await params).id);
}
