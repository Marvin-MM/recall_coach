/** Shared domain enums — safe for client and server (no runtime deps). */
export const COACHING_MODES = ["mock_interview", "drill", "review", "free_chat"] as const;
export type CoachingMode = (typeof COACHING_MODES)[number];

export const MEMORY_KINDS = [
  "profile",
  "target_role",
  "interview_date",
  "learning_style",
  "mistake",
  "strength",
  "improvement",
  "goal",
  "preference",
  "assignment",
] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

/** Kinds stored in the episodic facts namespace (everything except profile snapshots). */
export const FACT_KINDS = [
  "mistake",
  "strength",
  "improvement",
  "goal",
  "preference",
  "target_role",
  "interview_date",
  "learning_style",
  "assignment",
] as const satisfies readonly MemoryKind[];
export type FactKind = (typeof FACT_KINDS)[number];

export const MEMORY_STATUSES = ["pending", "done", "failed"] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];
