"use client";

import { EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { COACHING_MODE_DESCRIPTIONS, COACHING_MODE_LABELS } from "@/config/coach";
import { api } from "@/lib/api-client";
import type { MeDto, MemoryInspectorDto, SessionDto } from "@/types/api";
import { COACHING_MODES, type CoachingMode } from "@/types/domain";
import type { MemoryView } from "@/types/memory";
import { AmnesiaToggle } from "./amnesia-toggle";
import { formatWhen, KIND_META } from "./kind-meta";

function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function latest(dto: MemoryInspectorDto | null, n: number): MemoryView[] {
  if (!dto) return [];
  return Object.values(dto.groups)
    .flatMap((list) => list ?? [])
    .sort((a, b) => Date.parse(b.at ?? "0") - Date.parse(a.at ?? "0"))
    .slice(0, n);
}

export function HomeView({
  me,
  starting,
  onStart,
  onOpenInspector,
}: {
  me: MeDto;
  starting: boolean;
  onStart: (mode: CoachingMode, memoryEnabled: boolean) => void;
  onOpenInspector: () => void;
}) {
  const [amnesia, setAmnesia] = useState(false);
  const [memory, setMemory] = useState<MemoryInspectorDto | null>(null);
  const [memoryLoading, setMemoryLoading] = useState(true);
  const [sessions, setSessions] = useState<SessionDto[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .memory()
      .then((m) => !cancelled && setMemory(m))
      .catch(() => {})
      .finally(() => !cancelled && setMemoryLoading(false));
    api
      .sessions()
      .then((s) => !cancelled && setSessions(s.sessions))
      .catch(() => !cancelled && setSessions([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const recent = latest(memory, 3);

  return (
    <div className="flex-1 space-y-6 overflow-y-auto p-4 text-sm">
      <h3 className="text-lg font-medium">
        {greeting()}, {me.user.firstName || "there"}.
      </h3>

      <section aria-labelledby="home-remember" className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h4 id="home-remember" className="font-medium">
            What I remember
          </h4>
          <Button variant="link" size="xs" className="text-link" onClick={onOpenInspector}>
            See all
          </Button>
        </div>
        {memoryLoading ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : recent.length > 0 ? (
          <ul className="space-y-1.5">
            {recent.map((m) => {
              const meta = KIND_META[m.kind];
              const Icon = meta.icon;
              return (
                <li key={m.blobId} className="border-l-2 border-link bg-card py-1.5 pr-2 pl-3">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icon className="size-3.5 text-link" aria-hidden />
                    {meta.label}
                    {m.at && <span className="font-mono">{formatWhen(m.at)}</span>}
                  </p>
                  <p className="leading-snug">{m.text}</p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-muted-foreground">
            {memory?.profile
              ? `I know you're preparing for ${memory.profile.targetRole ?? "an interview"}. Practice once and I'll start keeping notes.`
              : me.doneMemories > 0
                ? "Your notes are still arriving from Walrus — check back in a minute."
                : "No notes yet. Your first session will give me something to remember."}
          </p>
        )}
      </section>

      <section aria-labelledby="home-modes" className="space-y-2">
        <h4 id="home-modes" className="font-medium">
          Start a session
        </h4>
        <div className="grid gap-2 sm:grid-cols-2">
          {COACHING_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={starting}
              onClick={() => onStart(mode, !amnesia)}
              className="group flex min-h-11 flex-col items-start gap-0.5 border border-border bg-card p-3 text-left transition-colors hover:border-ring disabled:opacity-60"
            >
              <span className="flex items-center gap-1.5 font-medium">
                {amnesia && <EyeOff className="size-3.5 text-muted-foreground" aria-hidden />}
                {COACHING_MODE_LABELS[mode]}
              </span>
              <span className="text-xs text-muted-foreground">
                {COACHING_MODE_DESCRIPTIONS[mode]}
              </span>
            </button>
          ))}
        </div>
        <AmnesiaToggle checked={amnesia} onCheckedChange={setAmnesia} />
      </section>

      <section aria-labelledby="home-recent" className="space-y-2">
        <h4 id="home-recent" className="font-medium">
          Recent sessions
        </h4>
        {sessions === null ? (
          <Skeleton className="h-16 w-full" />
        ) : sessions.length === 0 ? (
          <p className="text-muted-foreground">None yet.</p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {sessions.slice(0, 6).map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-foreground">{s.title}</span>
                {!s.memoryEnabled && <span className="text-muted-foreground">amnesia</span>}
                <span className="font-mono font-tabular text-muted-foreground">
                  {s.turnCount} {s.turnCount === 1 ? "turn" : "turns"}
                </span>
                <span className="font-mono font-tabular text-link">{s.savedMemories} saved</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
