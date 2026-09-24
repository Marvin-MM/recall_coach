import { createSessionsHandlers } from "@/server/api/sessions";
import { appDeps } from "@/server/container";

export const runtime = "nodejs";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: Ctx): Promise<Response> {
  return createSessionsHandlers(appDeps()).messages(request, (await params).id);
}

export async function DELETE(request: Request, { params }: Ctx): Promise<Response> {
  return createSessionsHandlers(appDeps()).deleteMessages(request, (await params).id);
}
