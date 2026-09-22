import type { LanguageModelV3StreamPart, LanguageModelV3Usage } from "@ai-sdk/provider";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import type { ModelFactory } from "./model";

const usage = (input: number, output: number): LanguageModelV3Usage => ({
  inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: output, text: output, reasoning: undefined },
});

export function textStreamParts(text: string, id = "t1"): LanguageModelV3StreamPart[] {
  const words = text.split(/(\s+)/).filter((w) => w.length > 0);
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id },
    ...words.map((delta): LanguageModelV3StreamPart => ({ type: "text-delta", id, delta })),
    { type: "text-end", id },
    {
      type: "finish",
      finishReason: { unified: "stop", raw: "stop" },
      usage: usage(10, words.length),
    },
  ];
}

export interface FakeModelOptions {
  /** Reply text for chat turns (can be a function of the call count). */
  chatReply?: string | ((call: number) => string);
  /** JSON string returned by extraction calls. */
  extractionJson?: string | ((call: number) => string);
  chunkDelayMs?: number;
}

export const DEFAULT_FAKE_REPLY =
  "Let's start with a behavioral question. **Tell me about a time you missed a deadline.** Use the STAR structure and finish with a measurable Result.";
export const DEFAULT_FAKE_EXTRACTION = JSON.stringify({
  facts: [
    {
      kind: "goal",
      text: "The user wants to practise behavioral STAR answers with measurable results.",
    },
  ],
  profileUpdate: null,
});

/**
 * Deterministic model factory for tests and E2E (LLM_DRIVER=fake). Uses the
 * AI SDK v6 MockLanguageModelV3 so the real streamText/generateText
 * pipelines run end to end.
 */
export function createFakeModelFactory(options: FakeModelOptions = {}): ModelFactory & {
  chat: MockLanguageModelV3;
  extraction: MockLanguageModelV3;
} {
  let chatCalls = 0;
  let extractionCalls = 0;
  const pick = (v: string | ((n: number) => string) | undefined, n: number, fallback: string) =>
    typeof v === "function" ? v(n) : (v ?? fallback);

  const chat = new MockLanguageModelV3({
    provider: "fake",
    modelId: "fake-chat",
    doStream: async () => {
      chatCalls++;
      const text = pick(options.chatReply, chatCalls, DEFAULT_FAKE_REPLY);
      return {
        stream: simulateReadableStream({
          chunks: textStreamParts(text),
          chunkDelayInMs: options.chunkDelayMs ?? 0,
        }),
      };
    },
  });

  const extraction = new MockLanguageModelV3({
    provider: "fake",
    modelId: "fake-extraction",
    doGenerate: async () => {
      extractionCalls++;
      const json = pick(options.extractionJson, extractionCalls, DEFAULT_FAKE_EXTRACTION);
      return {
        content: [{ type: "text", text: json }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: usage(10, 20),
        warnings: [],
      };
    },
  });

  return {
    chatModelId: "fake-chat",
    extractionModelId: "fake-extraction",
    chatModel: () => chat,
    extractionModel: () => extraction,
    chat,
    extraction,
  };
}
