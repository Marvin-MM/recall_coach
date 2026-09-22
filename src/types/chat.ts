import type { UIMessage } from "ai";
import type { MemoryKind } from "./domain";

/** One recalled memory shown as a chip under an assistant reply. */
export interface MemoryChip {
  blobId: string;
  kind: MemoryKind | "note";
  snippet: string;
  at: string | null;
}

/** `data-memory` part, sent BEFORE the reply text streams. */
export interface MemoryDataPart {
  recalled: MemoryChip[];
  degraded: boolean;
  reason: string | null;
  amnesia: boolean;
}

// A type alias (not an interface) so it satisfies AI SDK's `UIDataTypes`
// without an index signature that would widen `data-memory` to unknown.
export type CoachDataParts = {
  memory: MemoryDataPart;
};

export interface CoachMessageMetadata {
  createdAt?: number;
  model?: string;
  sessionId?: string;
}

export type CoachUIMessage = UIMessage<CoachMessageMetadata, CoachDataParts>;
