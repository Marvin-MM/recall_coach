"use client";

import { ChevronRight, EyeOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { COACHING_MODE_LABELS } from "@/config/coach";
import { ApiError, api } from "@/lib/api-client";
import type { SessionDto } from "@/types/api";
import { formatSessionDate } from "./session-detail";

/** Past sessions: mode, date, turns, memories saved, Amnesia badge. */
export function HistoryList({
  onOpen,
  onResume,
  canResume,
}: {
  onOpen: (session: SessionDto) => void;
  /** Reopen an unfinished session (history on only). */
  onResume: (session: SessionDto) => void;
  canResume: boolean;
}) {
  const [sessions, setSessions] = useState<SessionDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setError(null);
    api
      .sessions()
      .then((res) => !cancelled && setSessions(res.sessions))
      .catch(
        (e) => !cancelled && setError(e instanceof ApiError ? e.message : "Couldn't load history."),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load]);

  if (error) {
    return (
      <div role="alert" className="space-y-2">
        <p>{error}</p>
        <Button variant="outline" size="sm" onClick={() => load()}>
          Retry
        </Button>
      </div>
    );
  }
  if (sessions === null) {
    return (
      <div aria-busy="true" className="space-y-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }
  if (sessions.length === 0) {
    return (
      <p className="text-muted-foreground">No sessions yet. Your first one will show up here.</p>
    );
  }
  return (
    <ul className="divide-y divide-border border-y border-border" aria-label="Past sessions">
      {sessions.map((s) => {
        const open = s.endedAt === null;
        const resume = open && canResume;
        return (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => (resume ? onResume(s) : onOpen(s))}
              className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-muted"
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{COACHING_MODE_LABELS[s.mode]}</span>
                  {!s.memoryEnabled && (
                    <Badge variant="secondary" className="gap-1">
                      <EyeOff className="size-3" aria-hidden />
                      Amnesia
                    </Badge>
                  )}
                  {open && <Badge variant="outline">In progress</Badge>}
                </span>
                <span className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                  <span>{formatSessionDate(s.createdAt)}</span>
                  <span className="font-mono font-tabular">
                    {s.turnCount} {s.turnCount === 1 ? "turn" : "turns"}
                  </span>
                  <span className="font-mono font-tabular text-link">
                    {s.savedMemories} {s.savedMemories === 1 ? "memory" : "memories"} saved
                  </span>
                </span>
              </span>
              <span className="sr-only">{resume ? "Continue this session" : "View details"}</span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
