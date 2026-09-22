/**
 * Before/after transcript for the landing page: the same opening message sent
 * once in an Amnesia Mode session and once in a memory session by the same
 * consenting tester after ≥2 prior sessions (see docs/USER_TEST_GUIDE.md).
 *
 * Never ship invented transcripts. Until a real, consented export exists this
 * stays `null` and the landing page shows an honest placeholder.
 */
export interface TranscriptTurn {
  role: "user" | "coach";
  text: string;
}

export interface BeforeAfterContent {
  /** e.g. "Tester A, 3rd session, 24 Sep 2026" — no real names without consent. */
  attribution: string;
  amnesia: TranscriptTurn[];
  memory: TranscriptTurn[];
  /** Memories the coach recalled in the memory transcript (blob ids from the real export). */
  recalled: { kind: string; text: string; blobId: string }[];
}

// TODO(human): replace with a real exported transcript pair from a consenting tester
// (Export conversation → Markdown in both sessions), then set the attribution.
export const beforeAfter: BeforeAfterContent | null = null;
