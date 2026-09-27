import "server-only";
import { generateText, type LanguageModel, Output } from "ai";
import { z } from "zod";
import { coachLimits } from "@/config/coach";
import { LlmError } from "@/lib/errors";
import { coachProfileSchema } from "@/lib/schemas/profile";
import { MEMORY_TAGS, type MemoryTag } from "@/server/memory/tags";
import type { FactKind } from "@/types/domain";
import { type CoachProfile, EXPERIENCE_LEVELS } from "@/types/memory";
import { EXTRACTION_PROVIDER_OPTIONS, EXTRACTION_SETTINGS } from "./model";
import {
  buildExtractionPrompt,
  EXTRACTION_SYSTEM_PROMPT,
  type ExtractionPromptInput,
} from "./prompts/extraction";

/**
 * Kinds the model may emit. `assignment` is not among them: assignments are
 * the coach's own "Fix next time" line, parsed from the reply (see
 * assignment.ts); the model only classifies it via `assignmentTag`.
 */
export const EXTRACTED_KINDS = [
  "mistake",
  "strength",
  "improvement",
  "goal",
  "preference",
  "target_role",
  "interview_date",
  "learning_style",
] as const satisfies readonly FactKind[];

/**
 * Wire schema sent to the model. Groq strict JSON schema requires every
 * property to be required, so optional values are expressed as nullable and
 * length limits are enforced after parsing (not in the JSON schema). Tags are
 * a closed enum (strict mode constrains the output to it).
 */
export const extractionWireSchema = z.object({
  facts: z.array(
    z.object({ kind: z.enum(EXTRACTED_KINDS), tag: z.enum(MEMORY_TAGS), text: z.string() }),
  ),
  /** Tag of the coach's "Fix next time" in this reply; null when the reply has none. */
  assignmentTag: z.enum(MEMORY_TAGS).nullable(),
  /** True when the user's answer clearly did what the last assignment asked. */
  assignmentCompleted: z.boolean(),
  profileUpdate: z
    .object({
      targetRole: z.string().nullable(),
      company: z.string().nullable(),
      level: z.enum(EXPERIENCE_LEVELS).nullable(),
      interviewDate: z.string().nullable(),
      learningStyle: z.string().nullable(),
      focusAreas: z.array(z.string()).nullable(),
    })
    .nullable(),
});
export type ExtractionWire = z.infer<typeof extractionWireSchema>;

export interface ExtractedFact {
  kind: FactKind;
  tag: MemoryTag;
  text: string;
}

export interface ExtractionResult {
  facts: ExtractedFact[];
  profileUpdate: Partial<CoachProfile> | null;
  assignmentTag: MemoryTag | null;
  assignmentCompleted: boolean;
}

/** Validate + clip model output into our domain types (drops bad fields). */
export function normalizeExtraction(wire: ExtractionWire): ExtractionResult {
  const facts = wire.facts
    .map((f) => ({ kind: f.kind, tag: f.tag, text: f.text.replace(/\s+/g, " ").trim() }))
    .filter((f) => f.text.length >= 8)
    .slice(0, coachLimits.maxFactsPerTurn);

  let profileUpdate: Partial<CoachProfile> | null = null;
  if (wire.profileUpdate) {
    const candidate = Object.fromEntries(
      Object.entries(wire.profileUpdate).filter(
        ([, v]) =>
          v !== null &&
          !(typeof v === "string" && v.trim() === "") &&
          !(Array.isArray(v) && v.length === 0),
      ),
    );
    // Validate field by field so one bad value (e.g. malformed date) doesn't drop the rest.
    const shape = coachProfileSchema.shape;
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(candidate)) {
      const fieldSchema = shape[key as keyof typeof shape];
      if (!fieldSchema) continue;
      const parsed = fieldSchema.safeParse(
        key === "focusAreas" && Array.isArray(value)
          ? value.slice(0, coachLimits.maxFocusAreas)
          : value,
      );
      if (parsed.success && parsed.data !== undefined) cleaned[key] = parsed.data;
    }
    profileUpdate = Object.keys(cleaned).length > 0 ? (cleaned as Partial<CoachProfile>) : null;
  }
  return {
    facts,
    profileUpdate,
    assignmentTag: wire.assignmentTag,
    assignmentCompleted: wire.assignmentCompleted,
  };
}

export interface ExtractArgs extends ExtractionPromptInput {
  model: LanguageModel;
  timeoutMs?: number;
}

/** Structured-output extraction (AI SDK v6: generateText + Output.object). */
export async function extractMemories(args: ExtractArgs): Promise<ExtractionResult> {
  try {
    const { output } = await generateText({
      model: args.model,
      system: EXTRACTION_SYSTEM_PROMPT,
      prompt: buildExtractionPrompt(args),
      output: Output.object({ schema: extractionWireSchema, name: "coach_memories" }),
      ...EXTRACTION_SETTINGS,
      providerOptions: EXTRACTION_PROVIDER_OPTIONS,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(args.timeoutMs ?? 20_000),
    });
    return normalizeExtraction(output);
  } catch (error) {
    throw new LlmError("LLM_EXTRACTION_FAILED", "Memory extraction failed", {
      retryable: false,
      cause: error,
    });
  }
}
