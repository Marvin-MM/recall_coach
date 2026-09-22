import { z } from "zod";
import {
  coachLimits,
  EXPERIENCE_LEVELS,
  LEARNING_FORMATS,
  LEARNING_VERBOSITY,
} from "@/config/coach";
import { COACHING_MODES } from "@/types/domain";

/* ---------- Chat ---------- */

const textPart = z.object({
  type: z.literal("text"),
  text: z
    .string()
    .max(
      coachLimits.maxTextPartChars,
      `Text parts are limited to ${coachLimits.maxTextPartChars} characters`,
    ),
  state: z.enum(["streaming", "done"]).optional(),
});

/** Non-text parts the client may echo back (data/step/reasoning); ignored by the server. */
const PASSTHROUGH_PART = /^(data-[a-z-]+|step-start|reasoning|source-url|source-document|file)$/;

const messagePart = z
  .object({ type: z.string().max(40) })
  .loose()
  .superRefine((part, ctx) => {
    if (part.type === "text") {
      const parsed = textPart.safeParse(part);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
        }
      }
    } else if (!PASSTHROUGH_PART.test(part.type)) {
      ctx.addIssue({
        code: "custom",
        path: ["type"],
        message: `Unsupported part type "${part.type}"`,
      });
    }
  });

const uiMessage = z.object({
  id: z.string().min(1).max(100),
  role: z.enum(["user", "assistant"]),
  parts: z.array(messagePart).max(50),
  metadata: z.unknown().optional(),
});

export const chatRequestSchema = z.object({
  sessionId: z.uuid(),
  messages: z
    .array(uiMessage)
    .min(1)
    .max(coachLimits.maxMessages, `At most ${coachLimits.maxMessages} messages per request`)
    .refine((msgs) => msgs.at(-1)?.role === "user", {
      message: "The last message must be from the user",
    })
    .refine(
      (msgs) => {
        const last = msgs.at(-1);
        return (
          !!last &&
          last.parts.some(
            (p) =>
              p.type === "text" &&
              "text" in p &&
              typeof p.text === "string" &&
              p.text.trim().length > 0,
          )
        );
      },
      { message: "The last message must contain text" },
    ),
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
