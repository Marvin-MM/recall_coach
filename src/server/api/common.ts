import { COACHING_MODE_TITLES } from "@/config/coach";
import type { CoachingSessionRow } from "@/server/db/schema";
import type { CoachingMode } from "@/types/domain";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Generic title — never derived from message content. e.g. "Mock interview · 22 Sep" */
export function sessionTitle(mode: CoachingMode, at: Date): string {
  return `${COACHING_MODE_TITLES[mode]} · ${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}`;
}

export function toSessionBase(row: CoachingSessionRow) {
  return {
    id: row.id,
    mode: row.mode,
    title: row.title,
    memoryEnabled: row.memoryEnabled,
    turnCount: row.turnCount,
    createdAt: row.createdAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
  };
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}
