import { z } from "zod";
import { coachLimits, LEARNING_FORMATS, LEARNING_VERBOSITY } from "@/config/coach";
import { EXPERIENCE_LEVELS } from "@/types/memory";

const shortText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .transform((v) => v.replace(/\s+/g, " "));

export const isoDateSchema = z.iso.date();

/** Stored profile snapshot. Every field optional so partial updates merge. */
export const coachProfileSchema = z.object({
  targetRole: shortText(coachLimits.maxTargetRoleChars).optional(),
  company: shortText(coachLimits.maxCompanyChars).optional(),
  level: z.enum(EXPERIENCE_LEVELS).optional(),
  interviewDate: isoDateSchema.optional(),
  learningStyle: shortText(80).optional(),
  focusAreas: z
    .array(shortText(coachLimits.maxFocusAreaChars))
    .max(coachLimits.maxFocusAreas)
    .optional(),
});

export const learningStyleSchema = z.object({
  format: z.enum(LEARNING_FORMATS),
  verbosity: z.enum(LEARNING_VERBOSITY),
});

export function describeLearningStyle(style: z.infer<typeof learningStyleSchema>): string {
  return `${style.format}, ${style.verbosity}`;
}
