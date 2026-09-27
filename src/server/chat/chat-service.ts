import { APICallError, createUIMessageStream, createUIMessageStreamResponse, streamText } from "ai";
import { coachLimits } from "@/config/coach";
import { ConflictError, errorCode } from "@/lib/errors";
import { log } from "@/lib/log";
import { chatRequestSchema } from "@/lib/schemas/api";
import type { CoachUIMessage } from "@/types/chat";
import type { UserResolver } from "../auth/session";
import type { CoachingSessionsRepo } from "../db/repositories/coaching-sessions.repo";
import type { MemoryEventsRepo } from "../db/repositories/memory-events.repo";
import type { RecallEventsRepo } from "../db/repositories/recall-events.repo";
import type { UserSettingsRepo } from "../db/repositories/user-settings.repo";
import type { CoachingSessionRow } from "../db/schema";
import { errorResponse, parseJsonBody } from "../http/respond";
import type { ExtractionResult } from "../llm/extraction";
import { CHAT_PROVIDER_OPTIONS, CHAT_SETTINGS, type ModelFactory } from "../llm/model";
import type { ExtractionPromptInput } from "../llm/prompts/extraction";
import { buildSystemPrompt } from "../llm/prompts/system";
import type { AssignmentCache } from "../memory/assignment-cache";
import type { MemoryPort } from "../memory/memory-port";
import { deriveNamespaces } from "../memory/namespace";
import { persistTurn } from "../memory/persist-service";
import type { ProfileCache } from "../memory/profile-cache";
import { recallForTurn } from "../memory/recall-service";
import type { RateLimitPolicy } from "../ratelimit";
import type { ThreadHistoryArgs, ThreadMessage } from "../transcripts/thread-history";
import { type ThreadTurn, toModelMessages } from "./history";
import { buildMemoryPart } from "./memory-chips";

/**
 * Transcript writes, injected (the implementation lives in
 * src/server/transcripts/, which this module may not import apart from
 * thread-history.ts). See transcript-store.ts for the contract.
 */
export interface TranscriptWriter {
  beginTurn(input: {
    userId: string;
    sessionId: string;
    text: string;
    expectedSeq: number | null;
    now: Date;
  }): Promise<{ session: CoachingSessionRow; userSeq: number | null; nextSeq: number | null }>;
  appendAssistant(input: {
    userId: string;
    sessionId: string;
    seq: number;
    text: string;
    status: "ok" | "failed";
    now: Date;
  }): Promise<void>;
}

/** Longest the request waits for the model before recording the reply as failed. */
const REPLY_WAIT_MS = 58_000;

export interface ChatServiceDeps {
  requireUser: UserResolver;
  rateLimit: RateLimitPolicy;
  sessions: CoachingSessionsRepo;
  userSettings: UserSettingsRepo;
  memoryEvents: MemoryEventsRepo;
  recallEvents: RecallEventsRepo;
  transcripts: TranscriptWriter;
  /** The current thread's own messages only (src/server/transcripts/thread-history.ts). */
  threadHistory: (args: ThreadHistoryArgs) => Promise<ThreadMessage[]>;
  memoryFor: (memoryEnabled: boolean) => MemoryPort;
  models: ModelFactory;
  extract: (input: ExtractionPromptInput) => Promise<ExtractionResult>;
  /** Next.js `after()` in production; tests capture and await callbacks. */
  after: (task: () => Promise<void>) => void;
  namespacePrefix: string;
  recallTimeoutMs: number;
  profileCache?: ProfileCache;
  assignmentCache?: AssignmentCache;
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

      const settings = await deps.userSettings.get(user.id);
      const saveTranscripts = settings?.saveTranscripts ?? true;
      // The client picks the request shape from the setting it last saw.
      if (saveTranscripts ? body.expectedSeq === undefined : body.history === undefined) {
        throw new ConflictError(
          "Your conversation-history setting changed. Reloading the chat.",
          "HISTORY_SETTING_CHANGED",
        );
      }
      const lastUserText = body.message.trim();
      // Ownership (404), open (409), idle (409), seq (409), user message + activity: one transaction.
      const turn = await deps.transcripts.beginTurn({
        userId: user.id,
        sessionId: body.sessionId,
        text: lastUserText,
        expectedSeq: saveTranscripts ? (body.expectedSeq ?? null) : null,
        now: now(),
      });
      const session = turn.session;

      const namespaces = deriveNamespaces(
        user.id,
        settings?.namespaceVersion ?? 1,
        deps.namespacePrefix,
      );
      const memoryEnabled = session.memoryEnabled;
      const memory = deps.memoryFor(memoryEnabled);
      const firstTurn = session.turnCount === 0;

      // Model input = THIS thread only. History on: this session's own stored
      // messages (which already end with the new user message). History off:
      // the page's messages from the request, discarded afterwards.
      let thread: ThreadTurn[];
      if (saveTranscripts) {
        thread = await deps.threadHistory({
          userId: user.id,
          sessionId: session.id,
          maxTurns: coachLimits.historyTurns,
        });
        if (thread.at(-1)?.role !== "user") thread.push({ role: "user", text: lastUserText });
      } else {
        thread = [...(body.history ?? []), { role: "user", text: lastUserText }];
      }

      const [recall, previousPending] = await Promise.all([
        recallForTurn(
          {
            memory,
            timeoutMs: deps.recallTimeoutMs,
            ...(deps.profileCache ? { profileCache: deps.profileCache } : {}),
            ...(deps.assignmentCache ? { assignmentCache: deps.assignmentCache } : {}),
            hasSavedMemories: async () =>
              (await deps.memoryEvents.countDoneBlobsByUser(user.id)) > 0,
          },
          { namespaces, mode: session.mode, lastUserText, firstTurn, sessionId: session.id },
        ),
        // Metadata only: are an earlier session's memories still saving?
        memoryEnabled
          ? deps.memoryEvents.pendingFromOtherSession(user.id, session.id).catch((error) => {
              log.warn("chat.pending_check_failed", { code: errorCode(error) });
              return null;
            })
          : Promise.resolve(null),
      ]);

      const system = buildSystemPrompt({
        mode: session.mode,
        profile: recall.profile,
        facts: recall.facts,
        recap: recall.recap,
        memoryEnabled,
        degraded: recall.degraded,
        firstTurn,
        assignment: recall.assignment?.memory ?? null,
        patterns: recall.patterns,
        previousSessionPending: previousPending?.pending ?? 0,
        now: now(),
        userFirstName: user.name.split(/\s+/)[0] ?? null,
      });
      const modelMessages = toModelMessages(thread, coachLimits.historyTurns);

      let assistantText = "";
      let partialText = "";
      let llmFailed = false;
      let aborted = false;
      const memoryPart = buildMemoryPart(recall, !memoryEnabled);

      // Resolves when generation ends for any reason (finish, error, abort).
      let settle: () => void = () => {};
      const generationEnded = new Promise<void>((resolve) => {
        settle = resolve;
      });

      // Wait for the model, then store the reply (or "[response failed]")
      // before the stream closes, so the client can't send its next turn
      // until the assistant row exists.
      let replyStored: Promise<void> | undefined;
      const storeReply = () => {
        replyStored ??= (async () => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          await Promise.race([
            generationEnded,
            new Promise<void>((resolve) => {
              timer = setTimeout(resolve, REPLY_WAIT_MS);
            }),
          ]);
          if (timer) clearTimeout(timer);
          if (turn.userSeq === null) return; // history off: nothing is written
          const text = assistantText.trim() || (aborted ? partialText.trim() : "");
          try {
            await deps.transcripts.appendAssistant({
              userId: user.id,
              sessionId: session.id,
              seq: turn.userSeq + 1,
              text,
              status: llmFailed || text.length === 0 ? "failed" : "ok",
              now: now(),
            });
          } catch (error) {
            // The next turn's seq check (409 STALE_THREAD) makes the client reload.
            log.error("chat.transcript_reply_failed", { sessionId: session.id, error });
          }
        })();
        return replyStored;
      };

      const stream = createUIMessageStream<CoachUIMessage>({
        execute: async ({ writer }) => {
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
            onChunk: ({ chunk }) => {
              if (chunk.type === "text-delta") partialText += chunk.text;
            },
            onFinish: ({ text }) => {
              assistantText = text;
              settle();
            },
            onError: ({ error }) => {
              llmFailed = true;
              const { code } = describeLlmError(error);
              log.error(code, { model: deps.models.chatModelId, sessionId: session.id, error });
              settle();
            },
            onAbort: () => {
              aborted = true;
              settle();
            },
          });
          writer.merge(
            result.toUIMessageStream<CoachUIMessage>({
              sendReasoning: false,
              messageMetadata: ({ part }) =>
                part.type === "start"
                  ? {
                      createdAt: Date.now(),
                      model: deps.models.chatModelId,
                      sessionId: session.id,
                      ...(turn.nextSeq === null ? {} : { nextSeq: turn.nextSeq }),
                    }
                  : undefined,
              onError: (error) => describeLlmError(error).message,
            }),
          );
          await storeReply();
        },
        onError: (error) => describeLlmError(error).message,
      });

      deps.after(async () => {
        try {
          // Also keeps a serverless function alive if the client disconnected.
          await storeReply();
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
            attempt: recall.attempt,
          });
          if (!settings?.memoryConsentAt || llmFailed || assistantText.trim().length === 0) return;
          await persistTurn(
            {
              memory,
              memoryEvents: deps.memoryEvents,
              extract: deps.extract,
              ...(deps.profileCache ? { profileCache: deps.profileCache } : {}),
              ...(deps.assignmentCache ? { assignmentCache: deps.assignmentCache } : {}),
              now,
            },
            {
              userId: user.id,
              sessionId: session.id,
              namespaces,
              lastUserText,
              assistantText,
              profile: recall.profile,
              recalledTexts: [
                ...recall.recap,
                ...recall.facts,
                ...(recall.assignment ? [recall.assignment.memory] : []),
              ].map((m) => m.decoded?.body ?? m.text),
              knownMistakes: [...recall.recap, ...recall.facts]
                .filter((m) => m.decoded?.kind === "mistake")
                .map((m) => m.decoded?.body ?? m.text),
              lastAssignment: recall.assignment
                ? { body: recall.assignment.body, tag: recall.assignment.tag }
                : null,
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
