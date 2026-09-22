import { createChatService } from "@/server/chat/chat-service";
import { appDeps } from "@/server/container";

export const runtime = "nodejs";
// Streaming + after() persistence (extraction + Walrus write) needs headroom.
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  return createChatService(appDeps()).handle(request);
}
