import { vi } from "vitest";
import { RateLimitedError, UnauthorizedError } from "@/lib/errors";
import type { AuthUser } from "@/server/auth/session";
import { createChatService } from "@/server/chat/chat-service";
import { createCoachingSessionsRepo } from "@/server/db/repositories/coaching-sessions.repo";
import { createMemoryEventsRepo } from "@/server/db/repositories/memory-events.repo";
import { createRecallEventsRepo } from "@/server/db/repositories/recall-events.repo";
import { createUserSettingsRepo } from "@/server/db/repositories/user-settings.repo";
import type { Db } from "@/server/db/types";
import { extractMemories } from "@/server/llm/extraction";
import { createFakeModelFactory, type FakeModelOptions } from "@/server/llm/fake-model";
import {
  createFakeMemory,
  type FakeMemoryOptions,
  type FakeMemoryPort,
} from "@/server/memory/fake-memory";
import { noopMemory } from "@/server/memory/noop-memory";
import type { RateLimitPolicy } from "@/server/ratelimit";
import { loadThreadHistory } from "@/server/transcripts/thread-history";
import { createTranscriptStore } from "@/server/transcripts/transcript-store";
import { testKeyring } from "./transcripts";

export interface HarnessOptions {
  user: AuthUser | null;
  memory?: FakeMemoryOptions;
  model?: FakeModelOptions;
  rateLimited?: boolean;
  recallTimeoutMs?: number;
  now?: () => Date;
}

export function createChatHarness(db: Db, options: HarnessOptions) {
  const memory: FakeMemoryPort = createFakeMemory(options.memory);
  const models = createFakeModelFactory(options.model);
  const afterTasks: (() => Promise<void>)[] = [];
  const memoryFor = vi.fn((enabled: boolean) => (enabled ? memory : noopMemory));
  const threadHistory = vi.fn((args: Parameters<typeof loadThreadHistory>[0]) =>
    loadThreadHistory(args, { db, keyring: testKeyring }),
  );
  const rateLimit: RateLimitPolicy = {
    enforce: vi.fn(async () => {
      if (options.rateLimited) throw new RateLimitedError(42);
    }),
  };
  const service = createChatService({
    requireUser: async () => {
      if (!options.user) throw new UnauthorizedError();
      return options.user;
    },
    rateLimit,
    sessions: createCoachingSessionsRepo(db),
    userSettings: createUserSettingsRepo(db),
    memoryEvents: createMemoryEventsRepo(db),
    recallEvents: createRecallEventsRepo(db),
    transcripts: createTranscriptStore(db, testKeyring),
    threadHistory,
    memoryFor,
    models,
    extract: (input) => extractMemories({ ...input, model: models.extractionModel() }),
    after: (task) => {
      afterTasks.push(task);
    },
    namespacePrefix: "coach-test-v1",
    recallTimeoutMs: options.recallTimeoutMs ?? 1000,
    ...(options.now ? { now: options.now } : {}),
  });
  return {
    memory,
    models,
    memoryFor,
    threadHistory,
    rateLimit,
    afterTasks,
    async runAfter() {
      for (const t of afterTasks.splice(0)) await t();
    },
    post: (body: unknown) =>
      service.handle(
        new Request("http://localhost/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: typeof body === "string" ? body : JSON.stringify(body),
        }),
      ),
  };
}

/** Parse an AI SDK UI message SSE stream into chunk objects. */
export async function readUiStream(response: Response): Promise<Record<string, unknown>[]> {
  const text = await response.text();
  return text
    .split("\n")
    .filter((l) => l.startsWith("data: ") && l !== "data: [DONE]")
    .map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);
}

/** Every prompt the fake chat + extraction models received, as one string. */
export function allModelInput(models: {
  chat: { doStreamCalls: { prompt: unknown }[] };
  extraction: { doGenerateCalls: { prompt: unknown }[] };
}): string {
  return JSON.stringify([
    ...models.chat.doStreamCalls.map((c) => c.prompt),
    ...models.extraction.doGenerateCalls.map((c) => c.prompt),
  ]);
}
