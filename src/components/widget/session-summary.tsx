"use client";

import { Check, CloudUpload, TriangleAlert } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { coachLimits, RUBRIC_DIMENSIONS } from "@/config/coach";
import { usePrefersReducedMotion } from "@/hooks/use-media-query";
import { api } from "@/lib/api-client";
import type { SessionDetailDto } from "@/types/api";
import type { CoachUIMessage } from "@/types/chat";
import { conversationToMarkdown, downloadText, messageText } from "./export-conversation";
import { parseScorecard } from "./scorecard";

interface Props {
  sessionId: string;
  title: string;
  memoryEnabled: boolean;
  messages: readonly CoachUIMessage[];
  onHome: () => void;
  onHistory: () => void;
  onOpenInspector: () => void;
}

/** Poll the session until every Walrus job is done/failed (max 60 s). */
function useSessionJobs(sessionId: string, enabled: boolean) {
  const [detail, setDetail] = useState<SessionDetailDto | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [settled, setSettled] = useState(!enabled);

  useEffect(() => {
    let cancelled = false;
    const started = Date.now();
    let timer: number | undefined;

    async function poll() {
      try {
        const d = await api.session(sessionId);
        if (cancelled) return;
        setDetail(d);
        // Persistence runs after the last reply; keep polling while anything is pending
        // or while we haven't seen any job yet (extraction may still be running).
        const done = d.jobs.pending === 0 && Date.now() - started > 8000;
        if (!enabled || done) {
          setSettled(true);
          return;
        }
      } catch {
        // transient — keep polling until the deadline
      }
      if (Date.now() - started >= coachLimits.summaryPollMaxMs) {
        setTimedOut(true);
        setSettled(true);
        return;
      }
      timer = window.setTimeout(poll, coachLimits.summaryPollMs);
    }
    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [sessionId, enabled]);

  return { detail, timedOut, settled };
}

export function SessionSummary({
  sessionId,
  title,
  memoryEnabled,
  messages,
  onHome,
  onHistory,
  onOpenInspector,
}: Props) {
  const { detail, timedOut, settled } = useSessionJobs(sessionId, memoryEnabled);
  const reduce = usePrefersReducedMotion();

  const scores = useMemo(() => {
    const cards = messages
      .filter((m) => m.role === "assistant")
      .map((m) => parseScorecard(messageText(m)))
      .filter((c) => c !== null);
    if (cards.length === 0) return null;
    return RUBRIC_DIMENSIONS.map((dim) => {
      const values = cards.map((c) => c.scores[dim]).filter((v): v is number => v !== undefined);
      return {
        dim,
        avg: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
      };
    });
  }, [messages]);
  const lastFix = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m?.role !== "assistant") continue;
      const fix = parseScorecard(messageText(m))?.fix;
      if (fix) return fix;
    }
    return null;
  }, [messages]);

  const turns = detail?.turnCount ?? messages.filter((m) => m.role === "user").length;
  const jobs = detail?.jobs ?? { pending: 0, done: 0, failed: 0 };
  const saving = memoryEnabled && (jobs.pending > 0 || !settled);

  return (
    <div className="flex-1 space-y-6 overflow-y-auto p-4 text-sm">
      <div>
        <h3 className="text-base font-medium">Session complete</h3>
        <p className="text-muted-foreground">
          {title} ·{" "}
          <span className="font-mono font-tabular">
            {turns} {turns === 1 ? "turn" : "turns"}
          </span>
        </p>
      </div>

      {scores && (
        <section aria-labelledby="summary-rubric" className="@container">
          <h4 id="summary-rubric" className="mb-2 font-medium">
            Rubric average
          </h4>
          <dl className="grid grid-cols-2 gap-2 @lg:grid-cols-4">
            {scores.map(({ dim, avg }) => (
              <div key={dim} className="border border-border bg-card p-2">
                <dt className="text-xs text-muted-foreground">{dim}</dt>
                <dd className="font-mono font-tabular text-base">
                  {avg === null ? "–" : avg.toFixed(1)}
                  <span className="text-xs text-muted-foreground">/5</span>
                </dd>
              </div>
            ))}
          </dl>
          {lastFix && (
            <p className="mt-2">
              <span className="font-medium">Fix next time: </span>
              {lastFix}
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="summary-memory" className="border border-border bg-card p-3">
        <h4 id="summary-memory" className="mb-2 font-medium">
          Memory
        </h4>
        {!memoryEnabled ? (
          <p className="text-muted-foreground">
            Amnesia Mode was on — nothing from this session was saved.
          </p>
        ) : (
          <div aria-live="polite" className="space-y-1.5">
            <p className="flex items-center gap-2">
              {saving ? (
                <CloudUpload className="size-4 animate-pulse text-link" aria-hidden />
              ) : (
                <motion.span
                  initial={reduce ? false : { scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 420, damping: 18 }}
                  className="inline-flex size-5 items-center justify-center bg-memory text-memory-foreground"
                >
                  <Check className="size-3.5" aria-hidden />
                </motion.span>
              )}
              {saving ? "Saving to Walrus: " : "Saved to Walrus: "}
              {saving && jobs.pending > 0 && (
                <span className="font-mono font-tabular">{jobs.pending} pending → </span>
              )}
              <span className="font-mono font-tabular">{jobs.done} saved</span>
            </p>
            {jobs.failed > 0 && (
              <p className="flex items-center gap-2 text-destructive">
                <TriangleAlert className="size-4" aria-hidden />
                {jobs.failed} {jobs.failed === 1 ? "memory" : "memories"} couldn't be saved.
              </p>
            )}
            {timedOut && jobs.pending > 0 && (
              <p className="text-muted-foreground">
                Walrus writes can take a couple of minutes. They'll finish in the background — check
                “What I remember” later.
              </p>
            )}
            {settled && !saving && jobs.done === 0 && jobs.failed === 0 && (
              <p className="text-muted-foreground">
                Nothing new worth remembering this time — that's normal for short sessions.
              </p>
            )}
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <Button onClick={onHome}>Start another session</Button>
        <Button variant="outline" onClick={onHistory}>
          View in History
        </Button>
        {memoryEnabled && (
          <Button variant="outline" onClick={onOpenInspector}>
            What I remember
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() =>
            downloadText(
              `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`,
              conversationToMarkdown({ title, memoryEnabled, messages }),
            )
          }
          disabled={messages.length === 0}
        >
          Export conversation
        </Button>
      </div>
    </div>
  );
}
