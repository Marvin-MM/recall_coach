import { RUBRIC_DIMENSIONS, type RubricDimension } from "@/config/coach";
import type { MemoryKind } from "@/types/domain";

/**
 * Controlled tag vocabulary for coaching memories: one tag per rubric
 * dimension, plus `other`. Tags make "the same mistake" countable across
 * sessions without comparing free text. Lines written before tags existed
 * decode as `other`.
 */
export const MEMORY_TAGS = [
  ...(RUBRIC_DIMENSIONS.map((d) => d.toLowerCase()) as Lowercase<RubricDimension>[]),
  "other",
] as const;
export type MemoryTag = (typeof MEMORY_TAGS)[number];

/** Descriptions used in prompts (extraction hints and pattern lines). */
export const MEMORY_TAG_DESCRIPTIONS: Record<MemoryTag, string> = {
  structure: "answer structure (e.g. STAR order, a missing Result, no clear opening)",
  specificity: "vague answers without concrete details, numbers or their own role",
  impact: "missing outcomes, metrics or why the work mattered",
  communication: "rambling, unclear or overly long delivery",
  other: "something outside the four rubric dimensions",
};

/** Kinds whose lines carry a `[tag=…]` header field. */
export const TAGGED_KINDS = [
  "mistake",
  "strength",
  "improvement",
  "assignment",
] as const satisfies readonly MemoryKind[];

export function isTaggedKind(kind: MemoryKind): kind is (typeof TAGGED_KINDS)[number] {
  return (TAGGED_KINDS as readonly MemoryKind[]).includes(kind);
}

/** Unknown or missing tags count as `other` (legacy lines, future vocabularies). */
export function toMemoryTag(value: string | undefined | null): MemoryTag {
  return (MEMORY_TAGS as readonly string[]).includes(value ?? "") ? (value as MemoryTag) : "other";
}
