"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { MEMORY_KIND_LABELS } from "@/config/coach";
import { api } from "@/lib/api-client";
import type { MemoryInspectorDto } from "@/types/api";
import { BlobId } from "./blob-id";
import { formatWhen, KIND_META, KIND_ORDER } from "./kind-meta";

export function MemoryInspector({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [data, setData] = useState<MemoryInspectorDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.memory(refresh));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load memories.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const profile = data?.profile;
  const groups = KIND_ORDER.flatMap((kind) => {
    const items = data?.groups[kind];
    return items && items.length > 0 ? [{ kind, items }] : [];
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b border-border">
          <SheetTitle className="text-base">What I remember</SheetTitle>
          <SheetDescription>
            Read live from Walrus Memory, newest first. Only you and this coach can decrypt these
            notes.
          </SheetDescription>
          <div className="flex items-center gap-2 pt-1">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {data ? (
                <>
                  <span className="font-mono font-tabular text-foreground">
                    {data.totals.doneBlobs}
                  </span>{" "}
                  memories saved on Walrus
                </>
              ) : (
                " "
              )}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => void load(true)}
              disabled={loading}
            >
              <RefreshCw className={loading ? "animate-spin" : ""} aria-hidden />
              Refresh
            </Button>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto p-4 text-sm" aria-busy={loading}>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          {loading && !data && (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}
          {data?.degraded && (
            <p className="border-l-2 border-warning-foreground/60 bg-warning px-3 py-2 text-xs text-warning-foreground">
              Memory is temporarily unavailable. Try refreshing in a moment.
            </p>
          )}

          {profile && (
            <section aria-labelledby="inspector-profile">
              <h3 id="inspector-profile" className="mb-2 font-medium">
                Profile
              </h3>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border border-border bg-card p-3 text-xs">
                {profile.targetRole && (
                  <>
                    <dt className="text-muted-foreground">Target</dt>
                    <dd>
                      {profile.targetRole}
                      {profile.company ? ` at ${profile.company}` : ""}
                    </dd>
                  </>
                )}
                {profile.level && (
                  <>
                    <dt className="text-muted-foreground">Level</dt>
                    <dd>{profile.level}</dd>
                  </>
                )}
                {profile.interviewDate && (
                  <>
                    <dt className="text-muted-foreground">Interview</dt>
                    <dd className="font-mono">{profile.interviewDate}</dd>
                  </>
                )}
                {profile.learningStyle && (
                  <>
                    <dt className="text-muted-foreground">Learns best</dt>
                    <dd>{profile.learningStyle}</dd>
                  </>
                )}
                {profile.focusAreas && profile.focusAreas.length > 0 && (
                  <>
                    <dt className="text-muted-foreground">Focus</dt>
                    <dd>{profile.focusAreas.join(", ")}</dd>
                  </>
                )}
              </dl>
              {data?.profileAt && (
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  updated {formatWhen(data.profileAt)}
                </p>
              )}
            </section>
          )}

          {groups.map(({ kind, items }) => {
            const meta = KIND_META[kind];
            const Icon = meta.icon;
            return (
              <section key={kind} aria-labelledby={`inspector-${kind}`}>
                <h3 id={`inspector-${kind}`} className="mb-2 flex items-center gap-1.5 font-medium">
                  <Icon className="size-4 text-link" aria-hidden />
                  {kind === "note" ? "Other notes" : MEMORY_KIND_LABELS[kind]}
                  <span className="font-mono text-xs text-muted-foreground">{items.length}</span>
                </h3>
                <ul className="space-y-2">
                  {items.map((m) => (
                    <li key={m.blobId} className="border-l-2 border-link bg-card py-2 pr-2 pl-3">
                      <p className="leading-snug">{m.text}</p>
                      <div className="mt-1 flex items-center gap-2 text-muted-foreground">
                        {m.at && <span className="font-mono text-[11px]">{formatWhen(m.at)}</span>}
                        <BlobId blobId={m.blobId} className="ml-auto" />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          {data && !data.degraded && !profile && groups.length === 0 && (
            <div className="space-y-1 py-8 text-center">
              <p className="font-medium">Nothing saved yet</p>
              <p className="text-muted-foreground">
                Finish a practice session and I'll keep notes on what to work on next. New notes can
                take a minute to appear.
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
