import "server-only";
import { createGroq, type GroqProviderOptions } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";

/**
 * Model factory (DI boundary). Chat runs Qwen 3.8 27B on Groq in
 * instruct/non-thinking mode for latency; reasoning, if ever enabled, is
 * hidden and never sent back in history.
 */
export interface ModelFactory {
  readonly chatModelId: string;
  readonly extractionModelId: string;
  chatModel(): LanguageModel;
  extractionModel(): LanguageModel;
}

/** Instruct-mode sampling per the Qwen model card. */
export const CHAT_SETTINGS = { temperature: 0.7, topP: 0.8, maxOutputTokens: 900 } as const;
export const EXTRACTION_SETTINGS = { temperature: 0.2, topP: 0.8, maxOutputTokens: 600 } as const;

const groqChatOptions = {
  reasoningEffort: "none",
  reasoningFormat: "hidden",
} satisfies GroqProviderOptions;

const groqExtractionOptions = {
  ...groqChatOptions,
  structuredOutputs: true,
  strictJsonSchema: true,
} satisfies GroqProviderOptions;

export const CHAT_PROVIDER_OPTIONS = { groq: groqChatOptions };
export const EXTRACTION_PROVIDER_OPTIONS = { groq: groqExtractionOptions };

export function createGroqModelFactory(config: {
  apiKey: string;
  chatModelId: string;
  extractionModelId: string;
}): ModelFactory {
  const groq = createGroq({ apiKey: config.apiKey });
  return {
    chatModelId: config.chatModelId,
    extractionModelId: config.extractionModelId,
    chatModel: () => groq(config.chatModelId),
    extractionModel: () => groq(config.extractionModelId),
  };
}
