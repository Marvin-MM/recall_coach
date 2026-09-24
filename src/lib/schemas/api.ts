import { z } from "zod";
import {
  coachLimits,
  EXPERIENCE_LEVELS,
  LEARNING_FORMATS,
  LEARNING_VERBOSITY,
} from "@/config/coach";
import { COACHING_MODES } from "@/types/domain";

/* ---------- Chat ---------- */

const chatText = z
  .string()
  .max(
    coachLimits.maxTextPartChars,
    `Messages are limited to ${coachLimits.maxTextPartChars} characters`,
  )
  .refine((v) => v.trim().length > 0, { message: "Message text is required" });

/** One message of the page's own thread (history off only). */
export const clientHistoryMessageSchema = z.strictObject({
  role: z.enum(["user", "assistant"]),
  text: chatText,
});
export type ClientHistoryMessage = z.infer<typeof clientHistoryMessageSchema>;

/**
 * POST /api/chat.
 * - History on:  `{ sessionId, message, expectedSeq }` — the server stores the
 *   turn and rebuilds the thread from this session's encrypted transcript.
 * - History off: `{ sessionId, message, history }` — `history` is the current
 *   page's messages only (≤ 24), used for this request and discarded. With the
 *   new message appended, roles must alternate and end with the user.
 */
export const chatRequestSchema = z
  .strictObject({
    sessionId: z.uuid(),
    message: chatText,
    expectedSeq: z.int().min(0).max(1_000_000).optional(),
    history: z
      .array(clientHistoryMessageSchema)
      .max(
        coachLimits.maxClientHistory,
        `At most ${coachLimits.maxClientHistory} history messages per request`,
      )
      .optional(),
  })
  .superRefine((body, ctx) => {
    const hasSeq = body.expectedSeq !== undefined;
    const hasHistory = body.history !== undefined;
    if (hasSeq === hasHistory) {
      ctx.addIssue({
        code: "custom",
        path: [],
        message: "Send exactly one of expectedSeq (history on) or history (history off)",
      });
    }
    if (!body.history) return;
    const thread = [...body.history.map((m) => m.role), "user"];
    const alternates = thread.every((role, i) => role === (i % 2 === 0 ? "user" : "assistant"));
    if (!alternates || thread.length % 2 === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["history"],
        message:
          "history must alternate user/assistant, start with the user and end with a reply, so the new message is the last user turn",
      });
    }
  });
export type ChatRequest = z.infer<typeof chatRequestSchema>;

/* ---------- Sessions ---------- */

export const createSessionSchema = z.object({
  mode: z.enum(COACHING_MODES),
  memoryEnabled: z.boolean().default(true),
});
export type CreateSessionInput = z.input<typeof createSessionSchema>;

export const patchSessionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("end") }),
  z.object({ action: z.literal("setMemory"), enabled: z.boolean() }),
]);
export type PatchSessionInput = z.infer<typeof patchSessionSchema>;

export const sessionIdSchema = z.uuid();

export const patchSettingsSchema = z.strictObject({ saveTranscripts: z.boolean() });
export type PatchSettingsInput = z.infer<typeof patchSettingsSchema>;

/* ---------- Onboarding ---------- */

const trimmed = (max: number) =>
  z.string().trim().min(1, "Required").max(max, `At most ${max} characters`);

export const onboardingSchema = z.object({
  targetRole: trimmed(coachLimits.maxTargetRoleChars),
  company: z
    .string()
    .trim()
    .max(coachLimits.maxCompanyChars)
    .optional()
    .transform((v) => (v ? v : undefined)),
  level: z.enum(EXPERIENCE_LEVELS),
  interviewDate: z
    .union([z.iso.date(), z.literal("")])
    .optional()
    .transform((v) => (v ? v : undefined)),
  learningStyle: z.object({
    format: z.enum(LEARNING_FORMATS),
    verbosity: z.enum(LEARNING_VERBOSITY),
  }),
  focusAreas: z
    .array(trimmed(coachLimits.maxFocusAreaChars))
    .max(coachLimits.maxFocusAreas)
    .default([]),
  consent: z.literal(true, { error: "Consent is required to store memories" }),
});
export type OnboardingInput = z.input<typeof onboardingSchema>;
export type OnboardingData = z.output<typeof onboardingSchema>;
