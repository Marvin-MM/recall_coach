import type { MemoryTag } from "@/server/memory/tags";
import type { MemoryKind } from "./domain";

export const EXPERIENCE_LEVELS = ["intern", "junior", "mid", "senior", "staff+"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

/** Current coaching profile (latest snapshot in the profile namespace). */
export interface CoachProfile {
  targetRole?: string;
  company?: string;
  level?: ExperienceLevel;
  /** ISO date YYYY-MM-DD */
  interviewDate?: string;
  /** Free text, e.g. "examples-first, concise" */
  learningStyle?: string;
  focusAreas?: string[];
}

/** A memory line after decoding its self-describing header. */
export interface DecodedMemory {
  kind: MemoryKind;
  /** ISO timestamp from the header */
  at: string;
  sessionId?: string;
  /** Tagged kinds only (mistake/strength/improvement/assignment); legacy lines → `other`. */
  tag?: MemoryTag;
  version?: number;
  /** Fact text (or raw JSON payload for profile snapshots) */
  body: string;
  profile?: CoachProfile;
}

/** One recall hit from Walrus Memory. */
export interface RecalledMemory {
  blobId: string;
  text: string;
  distance: number;
  createdAt?: string;
  /** null for legacy/untyped lines; still usable as plain text. */
  decoded: DecodedMemory | null;
}

/** Per-item outcome of a remember-and-wait. */
export type RememberOutcome =
  | { ok: true; index: number; jobId: string; blobId: string; latencyMs: number }
  | {
      ok: false;
      index: number;
      jobId: string | null;
      errorCode: string;
      latencyMs: number | null;
      /** Relayer-provided reason (for logs only; never contains memory text). */
      detail?: string;
    };

export interface AcceptedMemoryJob {
  index: number;
  jobId: string;
}

/** Memory as shown to the user (inspector, chips). */
export interface MemoryView {
  blobId: string;
  kind: MemoryKind | "note";
  text: string;
  at: string | null;
  explorerUrl: string;
}
