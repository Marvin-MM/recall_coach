import type { TurnRecall } from "@/server/memory/recall-service";
import type { MemoryChip, MemoryDataPart } from "@/types/chat";
import type { RecalledMemory } from "@/types/memory";

const SNIPPET_CHARS = 180;

function snippet(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > SNIPPET_CHARS ? `${flat.slice(0, SNIPPET_CHARS - 1).trimEnd()}…` : flat;
}

export function toChip(m: RecalledMemory, seenIn?: ReadonlyMap<string, number>): MemoryChip {
  const d = m.decoded;
  if (d?.kind === "profile" && d.profile) {
    const p = d.profile;
    const parts = [
      p.targetRole && `${p.targetRole}${p.company ? ` at ${p.company}` : ""}`,
      p.interviewDate && `interview ${p.interviewDate}`,
      p.learningStyle,
    ].filter(Boolean);
    return {
      blobId: m.blobId,
      kind: "profile",
      snippet: snippet(parts.join(" · ") || "Coaching profile"),
      at: d.at,
    };
  }
  const seenInSessions = d?.kind === "mistake" && d.tag ? seenIn?.get(d.tag) : undefined;
  return {
    blobId: m.blobId,
    kind: d?.kind ?? "note",
    snippet: snippet(d?.body ?? m.text),
    at: d?.at ?? m.createdAt ?? null,
    ...(seenInSessions ? { seenInSessions } : {}),
  };
}

/** Chips for every memory that was put in front of the model this turn. */
export function buildMemoryPart(recall: TurnRecall, amnesia: boolean): MemoryDataPart {
  const assignment = recall.assignment?.memory;
  const listed = [...recall.recap, ...recall.facts];
  const all = [
    ...(recall.profileMemory ? [recall.profileMemory] : []),
    ...(assignment && !listed.some((m) => m.blobId === assignment.blobId) ? [assignment] : []),
    ...listed,
  ];
  const seenIn = new Map<string, number>(recall.patterns.map((p) => [p.tag, p.sessions]));
  return {
    // Provisional (not-yet-stored) entries have no blob id and no chip.
    recalled: all.filter((m) => m.blobId.length > 0).map((m) => toChip(m, seenIn)),
    degraded: recall.degraded,
    reason: recall.reason,
    amnesia,
  };
}
