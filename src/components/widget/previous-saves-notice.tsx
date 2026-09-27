"use client";

import { CloudUpload } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";

const POLL_MS = 5000;
const POLL_MAX_MS = 3 * 60_000;
const SAVED_VISIBLE_MS = 4000;

type NoticeState = { kind: "hidden" } | { kind: "saving"; pending: number } | { kind: "saved" };

/**
 * Honest "still saving" state: Mainnet saves can take 30 s+, so a new session
 * can start before the last one's memories are on Walrus. Shows a live count
 * (metadata only) until they land; the server completes jobs as it polls.
 */
export function PreviousSavesNotice({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<NoticeState>({ kind: "hidden" });

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let seenPending = false;
    const started = Date.now();

    const poll = async () => {
      try {
        const res = await api.previousSaves(sessionId);
        if (cancelled) return;
        if (res.pending > 0) {
          seenPending = true;
          setState({ kind: "saving", pending: res.pending });
          if (Date.now() - started < POLL_MAX_MS) timer = window.setTimeout(poll, POLL_MS);
          return;
        }
        if (seenPending) {
          setState({ kind: "saved" });
          timer = window.setTimeout(() => {
            if (!cancelled) setState({ kind: "hidden" });
          }, SAVED_VISIBLE_MS);
        }
      } catch {
        // Status only: on errors, stay quiet rather than show a stale count.
        if (!cancelled) setState({ kind: "hidden" });
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [sessionId]);

  if (state.kind === "hidden") return null;
  return (
    <p
      role="status"
      className="flex items-center gap-2 border-b border-border bg-card px-3 py-1.5 text-xs text-muted-foreground"
    >
      <CloudUpload className="size-3.5 shrink-0 text-link" aria-hidden />
      {state.kind === "saving" ? (
        <span>
          Your last session's memories are still saving to Walrus (usually under a minute) ·{" "}
          <span className="font-mono font-tabular text-foreground">{state.pending}</span> pending
        </span>
      ) : (
        <span>Your last session's memories are saved.</span>
      )}
    </p>
  );
}
