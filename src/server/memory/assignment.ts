import type { RecalledMemory } from "@/types/memory";
import type { MemoryTag } from "./tags";

/**
 * Assignments: the coach's one concrete fix ("**Fix next time:** …" in the
 * rubric format), saved as
 *   [kind=assignment][tag=<tag>][at=…][session=…] Coach asked the user to <fix>.
 * The next session's opening checks the latest one; when the user later does
 * it, an `improvement` with the same tag is saved.
 */
export const ASSIGNMENT_PREFIX = "Coach asked the user to ";
export const ASSIGNMENT_DONE_PREFIX = "The user did what the coach asked: ";

const FIX_LINE_RE = /^\s*[*_]{0,2}\s*Fix next time\s*:?\s*[*_]{0,2}\s*:?\s*(.+)$/im;
const MAX_FIX_CHARS = 280;

/** The coach's "Fix next time" text from a reply, or null when there is none. */
export function parseFixNextTime(reply: string): string | null {
  const match = FIX_LINE_RE.exec(reply);
  const raw = match?.[1]
    ?.replace(/[*_`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw || raw.length < 8) return null;
  return raw.length > MAX_FIX_CHARS ? `${raw.slice(0, MAX_FIX_CHARS - 1).trimEnd()}…` : raw;
}

/** "End with the metric." → "Coach asked the user to end with the metric." */
export function assignmentText(fix: string): string {
  const body = fix.replace(/[.\s]+$/, "");
  const lowered = /^[A-Z][a-z]/.test(body) ? body.charAt(0).toLowerCase() + body.slice(1) : body;
  return `${ASSIGNMENT_PREFIX}${lowered}.`;
}

/** The fix itself, without the "Coach asked the user to" prefix. */
export function assignmentFix(body: string): string {
  return body.startsWith(ASSIGNMENT_PREFIX) ? body.slice(ASSIGNMENT_PREFIX.length) : body;
}

export function completedAssignmentText(assignmentBody: string): string {
  return `${ASSIGNMENT_DONE_PREFIX}${assignmentFix(assignmentBody)}`;
}

export interface LatestAssignment {
  memory: RecalledMemory;
  tag: MemoryTag;
  at: string;
  body: string;
  /** An improvement for this assignment (same tag, not older) was recalled too. */
  completed: boolean;
}

/**
 * Newest assignment among recalled lines. `completed` is set when an
 * assignment-completion improvement with the same tag, at or after it, is
 * among the recalled lines.
 */
export function selectLatestAssignment(
  memories: readonly RecalledMemory[],
): LatestAssignment | null {
  let best: LatestAssignment | null = null;
  for (const m of memories) {
    const d = m.decoded;
    if (d?.kind !== "assignment") continue;
    if (!best || Date.parse(d.at) > Date.parse(best.at)) {
      best = { memory: m, tag: d.tag ?? "other", at: d.at, body: d.body, completed: false };
    }
  }
  if (!best) return null;
  const doneAfter = memories.some((m) => {
    const d = m.decoded;
    return (
      d?.kind === "improvement" &&
      d.tag === best.tag &&
      d.body.startsWith(ASSIGNMENT_DONE_PREFIX) &&
      Date.parse(d.at) >= Date.parse(best.at)
    );
  });
  return { ...best, completed: doneAfter };
}
