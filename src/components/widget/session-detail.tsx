"use client";

import { ArrowLeft, EyeOff, Plus, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageResponse } from "@/components/ai-elements/message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { COACHING_MODE_LABELS } from "@/config/coach";
import { useElementWidth } from "@/hooks/use-element-width";
import { ApiError, api } from "@/lib/api-client";
import type { SessionMemoriesDto, SessionMessagesDto } from "@/types/api";
import type { CoachingMode } from "@/types/domain";
import { BlobId } from "./blob-id";
import { formatWhen, KIND_META } from "./kind-meta";
import type { DetailSeed, RecapSeed } from "./state";

/** Two panes at this container width and up (e.g. /coach); tabs below (floating panel, phones). */
const TWO_PANE_MIN_PX = 640;

type Load<T> =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ok"; data: T };

const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

export function formatSessionDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function TranscriptPane({ load }: { load: Load<SessionMessagesDto> }) {
  if (load.state === "loading") {
    return (
      <div aria-busy="true" className="space-y-2">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="ml-auto h-10 w-2/3" />
      </div>
    );
  }
  if (load.state === "error") return <p role="alert">{load.message}</p>;
  if (load.data.messages.length === 0) {
    return (
      <p className="text-muted-foreground">
        Transcript not saved (this session predates history or history was off).
      </p>
    );
  }
  return (
    <ol className="space-y-3" aria-label="Transcript">
      {load.data.messages.map((m) => (
        <li
          key={m.seq}
          className={
            m.role === "user"
              ? "ml-6 border-l-2 border-ring/60 bg-accent px-3 py-2"
              : "mr-2 border-l-2 border-border bg-card px-3 py-2"
          }
        >
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            {m.role === "user" ? "You" : "Coach"}
          </p>
          {m.status === "failed" || m.status === "unreadable" ? (
            <p className="flex items-center gap-1.5 text-muted-foreground italic">
              <TriangleAlert className="size-3.5" aria-hidden />
              {m.status === "failed" ? "Response failed" : "This message couldn't be decrypted."}
            </p>
          ) : m.role === "assistant" ? (
            <MessageResponse>{m.text}</MessageResponse>
          ) : (
            <p className="whitespace-pre-wrap">{m.text}</p>
          )}
        </li>
      ))}
    </ol>
  );
}

function MemoriesPane({
  load,
  memoryEnabled,
}: {
  load: Load<SessionMemoriesDto>;
  memoryEnabled: boolean;
}) {
  if (!memoryEnabled)
    return <p className="text-muted-foreground">Nothing was saved — memory was off.</p>;
  if (load.state === "loading") {
    return (
      <div aria-busy="true" className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  if (load.state === "error") return <p role="alert">{load.message}</p>;
  const { items, retrieved, expected, degraded } = load.data;
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground">
        Nothing from this session was worth remembering — that's normal for short sessions.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {retrieved < expected && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          Showing {retrieved} of {expected} saved memories
          {degraded ? " — Walrus Memory is slow to respond right now." : "."}
        </p>
      )}
      <ul className="space-y-2" aria-label="Memories saved from this session">
        {items.map((item, i) => {
          const meta = KIND_META[item.kind];
          const Icon = meta.icon;
          return (
            <li
              key={item.blobId ?? `${item.kind}-${i}`}
              className="border border-border bg-card p-3"
            >
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="size-3.5 text-link" aria-hidden />
                <span className="font-medium text-foreground">{meta.label}</span>
                {item.at && <span className="font-mono">{formatWhen(item.at)}</span>}
                {item.status !== "done" && (
                  <Badge
                    variant={item.status === "failed" ? "destructive" : "secondary"}
                    className="ml-auto"
                  >
                    {item.status === "failed" ? "Not saved" : "Saving…"}
                  </Badge>
                )}
              </p>
              <p className="mt-1 leading-snug">
                {item.text ??
                  (item.status === "done" ? (
                    <span className="text-muted-foreground italic">
                      Saved on Walrus; the text didn't come back from recall just now.
                    </span>
                  ) : item.status === "failed" ? (
                    <span className="text-muted-foreground italic">
                      This memory couldn't be saved.
                    </span>
                  ) : (
                    <span className="text-muted-foreground italic">
                      Still being written to Walrus.
                    </span>
                  ))}
              </p>
              {item.blobId && <BlobId blobId={item.blobId} className="mt-1.5" />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Read-only session detail. Transcripts are for the user; memories are for
 * the coach — this view shows both side by side. Ended sessions can't be
 * resumed; the only action starts a NEW session that remembers.
 */
export function SessionDetail({
  session,
  onBack,
  onNewSession,
}: {
  session: DetailSeed;
  onBack: () => void;
  onNewSession: (mode: CoachingMode, recap: RecapSeed) => void;
}) {
  const [transcript, setTranscript] = useState<Load<SessionMessagesDto>>({ state: "loading" });
  const [memories, setMemories] = useState<Load<SessionMemoriesDto>>({ state: "loading" });
  const rootRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(rootRef);
  const twoPane = width >= TWO_PANE_MIN_PX;
  const headingRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback(() => {
    let cancelled = false;
    api
      .sessionMessages(session.sessionId)
      .then((data) => !cancelled && setTranscript({ state: "ok", data }))
      .catch(
        (e) =>
          !cancelled &&
          setTranscript({ state: "error", message: errorText(e, "Couldn't load the transcript.") }),
      );
    if (session.memoryEnabled) {
      api
        .sessionMemories(session.sessionId)
        .then((data) => !cancelled && setMemories({ state: "ok", data }))
        .catch(
          (e) =>
            !cancelled &&
            setMemories({ state: "error", message: errorText(e, "Couldn't load memories.") }),
        );
    }
    return () => {
      cancelled = true;
    };
  }, [session.sessionId, session.memoryEnabled]);

  useEffect(() => load(), [load]);
  useEffect(() => headingRef.current?.focus(), []);

  // Distinct texts: two blobs can hold the same sentence (saved in different turns).
  const recapItems =
    memories.state === "ok"
      ? [
          ...new Set(
            memories.data.items.flatMap((i) => (i.text && i.kind !== "profile" ? [i.text] : [])),
          ),
        ]
      : [];

  const transcriptBody = (
    <>
      <h4 id="detail-transcript" className={twoPane ? "font-medium" : "sr-only"}>
        Transcript
      </h4>
      <TranscriptPane load={transcript} />
    </>
  );
  const memoriesBody = (
    <>
      <h4 id="detail-memories" className="font-medium">
        What your coach kept from this session
      </h4>
      <MemoriesPane load={memories} memoryEnabled={session.memoryEnabled} />
    </>
  );
  // Scrollable panes are keyboard reachable (tabIndex=0) and labelled by their heading.
  const pane = "min-h-0 space-y-2 overflow-y-auto p-4 outline-none focus-visible:ring-2";

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col text-sm">
      <div className="space-y-1 border-b border-border px-3 py-2">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
          <ArrowLeft aria-hidden />
          History
        </Button>
        <h3 ref={headingRef} tabIndex={-1} className="text-base font-medium outline-none">
          {session.title}
        </h3>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span>{COACHING_MODE_LABELS[session.mode]}</span>
          <span aria-hidden>·</span>
          <span>{formatSessionDate(session.createdAt)}</span>
          <span aria-hidden>·</span>
          <span className="font-mono font-tabular">
            {session.turnCount} {session.turnCount === 1 ? "turn" : "turns"}
          </span>
          {!session.memoryEnabled && (
            <Badge variant="secondary" className="gap-1">
              <EyeOff className="size-3" aria-hidden />
              Amnesia
            </Badge>
          )}
        </p>
      </div>

      {twoPane ? (
        <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-border">
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable region must be keyboard reachable */}
          <section aria-labelledby="detail-transcript" tabIndex={0} className={pane}>
            {transcriptBody}
          </section>
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable region must be keyboard reachable */}
          <section aria-labelledby="detail-memories" tabIndex={0} className={pane}>
            {memoriesBody}
          </section>
        </div>
      ) : (
        <Tabs defaultValue="transcript" className="min-h-0 flex-1 gap-0">
          <TabsList className="mx-3 mt-2 w-[calc(100%-1.5rem)]" aria-label="Session detail">
            <TabsTrigger value="transcript">Transcript</TabsTrigger>
            <TabsTrigger value="memories">Memories</TabsTrigger>
          </TabsList>
          <TabsContent value="transcript" className={pane}>
            {transcriptBody}
          </TabsContent>
          <TabsContent value="memories" className={pane}>
            {memoriesBody}
          </TabsContent>
        </Tabs>
      )}

      <div className="border-t border-border p-3">
        <Button
          className="w-full sm:w-auto"
          onClick={() =>
            onNewSession(session.mode, { fromTitle: session.title, items: recapItems.slice(0, 4) })
          }
        >
          <Plus aria-hidden />
          New session (coach remembers you)
        </Button>
      </div>
    </div>
  );
}
