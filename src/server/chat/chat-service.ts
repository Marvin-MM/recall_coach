import {
  APICallError,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
} from "ai";
import { coachLimits } from "@/config/coach";
import { ConflictError, errorCode, NotFoundError } from "@/lib/errors";
import { log } from "@/lib/log";
import { chatRequestSchema } from "@/lib/schemas/api";
import type { CoachUIMessage } from "@/types/chat";
import type { UserResolver } from "../auth/session";
import type { CoachingSessionsRepo } from "../db/repositories/coaching-sessions.repo";
import type { MemoryEventsRepo } from "../db/repositories/memory-events.repo";
import type { RecallEventsRepo } from "../db/repositories/recall-events.repo";
import type { UserSettingsRepo } from "../db/repositories/user-settings.repo";
import { errorResponse, parseJsonBody } from "../http/respond";
import type { ExtractionResult } from "../llm/extraction";
import { CHAT_PROVIDER_OPTIONS, CHAT_SETTINGS, type ModelFactory } from "../llm/model";
import type { ExtractionPromptInput } from "../llm/prompts/extraction";
import { buildSystemPrompt } from "../llm/prompts/system";
import type { MemoryPort } from "../memory/memory-port";
import { deriveNamespaces } from "../memory/namespace";
import { persistTurn } from "../memory/persist-service";
import type { ProfileCache } from "../memory/profile-cache";
import { recallForTurn } from "../memory/recall-service";
import type { RateLimitPolicy } from "../ratelimit";
import { textOf, trimHistory } from "./history";
import { buildMemoryPart } from "./memory-chips";

export interface ChatServiceDeps {
  requireUser: UserResolver;
  rateLimit: RateLimitPolicy;
  sessions: CoachingSessionsRepo;
  userSettings: UserSettingsRepo;
  memoryEvents: MemoryEventsRepo;
  recallEvents: RecallEventsRepo;
  memoryFor: (memoryEnabled: boolean) => MemoryPort;
  models: ModelFactory;
  extract: (input: ExtractionPromptInput) => Promise<ExtractionResult>;
  /** Next.js `after()` in production; tests capture and await callbacks. */
  after: (task: () => Promise<void>) => void;
  namespacePrefix: string;
  recallTimeoutMs: number;
  profileCache?: ProfileCache;
  now?: () => Date;
}

export const FRIENDLY_LLM_ERROR =
  "Sorry — I couldn't generate a reply just now. Please try again in a moment.";

export function describeLlmError(error: unknown): { code: string; message: string } {
  if (APICallError.isInstance(error)) {
    if (
      error.statusCode === 404 ||
      /model.*(not found|does not exist|decommissioned)/i.test(error.message)
    ) {
      return {
        code: "llm.model_not_found",
        message: "The configured model is unavailable. An admin needs to update GROQ_MODEL.",
      };
    }
    if (error.statusCode === 429) {
      return {
        code: "llm.rate_limited",
        message: "The coach is busy right now. Please retry in a few seconds.",
      };
    }
    return { code: `llm.http_${error.statusCode ?? "error"}`, message: FRIENDLY_LLM_ERROR };
  }
  return { code: "llm.error", message: FRIENDLY_LLM_ERROR };
}

export function createChatService(deps: ChatServiceDeps) {
  const now = deps.now ?? (() => new Date());

  async function handle(request: Request): Promise<Response> {
    try {
      const user = await deps.requireUser(request);
      await deps.rateLimit.enforce("chat", user.id);
      const body = await parseJsonBody(request, chatRequestSchema);

      const session = await deps.sessions.getForUser({ id: body.sessionId, userId: user.id });
      // 404 (not 403) for other users' sessions: no enumeration.
      if (!session) throw new NotFoundError("Session not found.");
      if (session.endedAt) throw new ConflictError("This session has ended. Start a new one.");

      const settings = await deps.userSettings.get(user.id);
      const namespaces = deriveNamespaces(
        user.id,
        settings?.namespaceVersion ?? 1,
        deps.namespacePrefix,
      );
      const memoryEnabled = session.memoryEnabled;
      const memory = deps.memoryFor(memoryEnabled);
      const lastUser = body.messages.at(-1);
      const lastUserText = lastUser ? textOf(lastUser) : "";
      const firstTurn = session.turnCount === 0;

      const recall = await recallForTurn(
        {
          memory,
          timeoutMs: deps.recallTimeoutMs,
          ...(deps.profileCache ? { profileCache: deps.profileCache } : {}),
        },
        { namespaces, mode: session.mode, lastUserText, firstTurn },
      );

      const system = buildSystemPrompt({
        mode: session.mode,
        profile: recall.profile,
        facts: recall.facts,
        recap: recall.recap,
        memoryEnabled,
        degraded: recall.degraded,
        firstTurn,
        now: now(),
        userFirstName: user.name.split(/\s+/)[0] ?? null,
      });
      const modelMessages = await convertToModelMessages(
        trimHistory(body.messages, coachLimits.historyTurns),
      );

      let assistantText = "";
      let llmFailed = false;
      const memoryPart = buildMemoryPart(recall, !memoryEnabled);

      const stream = createUIMessageStream<CoachUIMessage>({
        execute: ({ writer }) => {
          // Memory chips first, so the UI can render them before any text.
          writer.write({ type: "data-memory", data: memoryPart });
          const result = streamText({
            model: deps.models.chatModel(),
            system,
            messages: modelMessages,
            ...CHAT_SETTINGS,
            providerOptions: CHAT_PROVIDER_OPTIONS,
            maxRetries: 1,
            abortSignal: request.signal,
            onFinish: ({ text }) => {
              assistantText = text;
            },
            onError: ({ error }) => {
              llmFailed = true;
              const { code } = describeLlmError(error);
              log.error(code, { model: deps.models.chatModelId, sessionId: session.id, error });
            },
          });
          writer.merge(
            result.toUIMessageStream<CoachUIMessage>({
              sendReasoning: false,
              messageMetadata: ({ part }) =>
                part.type === "start"
                  ? { createdAt: Date.now(), model: deps.models.chatModelId, sessionId: session.id }
                  : undefined,
              onError: (error) => describeLlmError(error).message,
            }),
          );
        },
        onError: (error) => describeLlmError(error).message,
      });

      deps.after(async () => {
        try {
          await deps.sessions.incrementTurn({ id: session.id, userId: user.id });
          if (!memoryEnabled) return; // Amnesia Mode: nothing recorded, nothing saved.
          await deps.recallEvents.record({
            userId: user.id,
            coachingSessionId: session.id,
            recalledBlobIds: memoryPart.recalled.map((c) => c.blobId),
            resultCount: memoryPart.recalled.length,
            bestDistance: recall.bestDistance,
            latencyMs: recall.latencyMs,
            degraded: recall.degraded,
            degradedReason: recall.reason,
          });
          if (!settings?.memoryConsentAt || llmFailed || assistantText.trim().length === 0) return;
          await persistTurn(
            {
              memory,
              memoryEvents: deps.memoryEvents,
              extract: deps.extract,
              ...(deps.profileCache ? { profileCache: deps.profileCache } : {}),
              now,
            },
            {
              userId: user.id,
              sessionId: session.id,
              namespaces,
              lastUserText,
              assistantText,
              profile: recall.profile,
              recalledTexts: [...recall.recap, ...recall.facts].map(
                (m) => m.decoded?.body ?? m.text,
              ),
              knownMistakes: [...recall.recap, ...recall.facts]
                .filter((m) => m.decoded?.kind === "mistake")
                .map((m) => m.decoded?.body ?? m.text),
            },
          );
        } catch (error) {
          log.error("chat.after_failed", { sessionId: session.id, code: errorCode(error), error });
        }
      });

      return createUIMessageStreamResponse({ stream, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return errorResponse(error, { route: "chat" });
    }
  }

  return { handle };
}
