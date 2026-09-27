import type { CoachingMode, MemoryKind } from "@/types/domain";

export const COACHING_MODE_LABELS: Record<CoachingMode, string> = {
  mock_interview: "Mock interview",
  drill: "Drill a weak spot",
  review: "Review progress",
  free_chat: "Just chat",
};

/** Short labels for generic session titles ("Mock interview · 22 Sep"). */
export const COACHING_MODE_TITLES: Record<CoachingMode, string> = {
  mock_interview: "Mock interview",
  drill: "Drill",
  review: "Review",
  free_chat: "Free chat",
};

export const COACHING_MODE_DESCRIPTIONS: Record<CoachingMode, string> = {
  mock_interview: "One question at a time, then rubric feedback and one concrete fix.",
  drill: "Targeted practice on a weak spot I've noticed before.",
  review: "Walk through past mistakes and progress, then plan next steps.",
  free_chat: "Open coaching conversation — ask anything.",
};

export const RUBRIC_DIMENSIONS = ["Structure", "Specificity", "Impact", "Communication"] as const;
export type RubricDimension = (typeof RUBRIC_DIMENSIONS)[number];

export const MEMORY_KIND_LABELS: Record<MemoryKind, string> = {
  profile: "Profile",
  target_role: "Target role",
  interview_date: "Interview date",
  learning_style: "Learning style",
  mistake: "Mistakes",
  strength: "Strengths",
  improvement: "Improvements",
  goal: "Goals",
  preference: "Preferences",
  assignment: "Assignments",
};

export const EXPERIENCE_LEVELS = ["intern", "junior", "mid", "senior", "staff+"] as const;
export const LEARNING_FORMATS = ["examples-first", "theory-first", "socratic"] as const;
export const LEARNING_VERBOSITY = ["concise", "detailed"] as const;

export const coachLimits = {
  /** Chat request limits (validated with Zod on the server). */
  maxMessages: 40,
  maxTextPartChars: 4000,
  /** Model context: last N user/assistant turns (memory carries the rest). */
  historyTurns: 12,
  /** History off: the client sends the page's thread (at most this many messages). */
  maxClientHistory: 24,
  /** Sessions idle this long are ended (lazily + daily cron). No resume after that. */
  sessionIdleMs: 2 * 60 * 60 * 1000,
  /** Session memories view: recall limit per broad query (≤ 50). */
  sessionMemoriesLimit: 50,
  maxFocusAreas: 5,
  maxFocusAreaChars: 80,
  maxTargetRoleChars: 80,
  maxCompanyChars: 80,
  /** Memory text cap per fact (enforced by memory-format). */
  maxFactChars: 400,
  maxFactsPerTurn: 5,
  /** Rate limits per user. */
  chatPerMinute: 20,
  chatPerDay: 300,
  apiPerMinute: 60,
  /** Recall. */
  factsLimit: 8,
  factsMaxDistance: 0.65,
  profileLimit: 5,
  recapLimit: 6,
  assignmentLimit: 5,
  /** Bulk remember cap per SDK call. */
  bulkMax: 20,
  /** Summary polling (client). */
  summaryPollMs: 2000,
  summaryPollMaxMs: 60_000,
  /** Memory inspector cache per user. */
  inspectorCacheMs: 30_000,
  healthCacheMs: 15_000,
} as const;

export const RECALL_QUERIES = {
  profile: "current coaching profile target role learning style",
  recap: "most recent mistakes and progress",
  assignment: "Coach asked the user to practise this fix next time",
  fallbackByMode: {
    mock_interview: "recent interview mistakes and weak spots",
    drill: "recurring interview mistakes and weak spots to drill",
    review: "past mistakes strengths and improvements progress",
    free_chat: "recent interview mistakes and weak spots",
  } satisfies Record<CoachingMode, string>,
  inspector: ["interview mistakes", "strengths and improvements", "goals and preferences"],
} as const;
