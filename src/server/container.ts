import "server-only";
import { after } from "next/server";
import { env } from "@/env";
import { getOptionalUser, requireUser } from "./auth/session";
import { getDb } from "./db/client";
import { createCoachingSessionsRepo } from "./db/repositories/coaching-sessions.repo";
import { createEvidenceRepo } from "./db/repositories/evidence.repo";
import { createMemoryEventsRepo } from "./db/repositories/memory-events.repo";
import { createRecallEventsRepo } from "./db/repositories/recall-events.repo";
import { createUserSettingsRepo } from "./db/repositories/user-settings.repo";
import { extractMemories } from "./llm/extraction";
import { createFakeModelFactory } from "./llm/fake-model";
import { createGroqModelFactory, type ModelFactory } from "./llm/model";
import type { ExtractionPromptInput } from "./llm/prompts/extraction";
import { profileCache } from "./memory/profile-cache";
import { getMemoryPort, memoryForSession } from "./memory/provider";
import { getRateLimitPolicy } from "./ratelimit";

let models: ModelFactory | undefined;
function getModels(): ModelFactory {
  models ??=
    env.LLM_DRIVER === "fake"
      ? createFakeModelFactory({ chunkDelayMs: 15 }) // test-only; rejected in production
      : createGroqModelFactory({
          apiKey: env.GROQ_API_KEY,
          chatModelId: env.GROQ_MODEL,
          extractionModelId: env.GROQ_EXTRACTION_MODEL,
        });
  return models;
}

/** Production wiring for route handlers (the only place concrete deps meet). */
export function appDeps() {
  const db = getDb();
  const modelFactory = getModels();
  return {
    requireUser,
    getOptionalUser,
    rateLimit: getRateLimitPolicy((task) => {
      void task().catch(() => {});
    }),
    sessions: createCoachingSessionsRepo(db),
    userSettings: createUserSettingsRepo(db),
    memoryEvents: createMemoryEventsRepo(db),
    recallEvents: createRecallEventsRepo(db),
    evidence: createEvidenceRepo(db),
    memoryFor: memoryForSession,
    memory: getMemoryPort,
    models: modelFactory,
    extract: (input: ExtractionPromptInput) =>
      extractMemories({ ...input, model: modelFactory.extractionModel() }),
    after: (task: () => Promise<void>) => after(task),
    profileCache,
    namespacePrefix: env.MEMWAL_NAMESPACE_PREFIX,
    recallTimeoutMs: env.MEMWAL_RECALL_TIMEOUT_MS,
    adminEmails: env.ADMIN_EMAILS,
    explorerBlobUrl: env.NEXT_PUBLIC_WALRUS_EXPLORER_BLOB_URL,
  };
}

export type AppDeps = ReturnType<typeof appDeps>;
