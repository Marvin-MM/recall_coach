"use client";

import {
  AlertTriangle,
  ArrowRight,
  EyeOff,
  Flag,
  GraduationCap,
  History,
  NotebookPen,
  Target,
  ThumbsUp,
  TrendingUp,
} from "lucide-react";
import { AnimatePresence, motion, useInView } from "motion/react";
import { useId, useRef, useState } from "react";
import { openCoachWidget } from "@/components/widget/widget-events";
import { beforeAfter, type TranscriptTurn } from "@/content/before-after";
import { usePrefersReducedMotion } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { Section } from "./section";

const EASE = [0.16, 1, 0.3, 1] as const;

/* ------------------------------------------------------------------ */
/* Same question, with and without memory                               */
/* ------------------------------------------------------------------ */

type Mode = "amnesia" | "memory";

const OPENING = "Let's practice. What should I work on?";

/**
 * What each mode feeds the model. This describes the mechanism (what is
 * recalled before the reply), not a user's conversation — real transcripts
 * only come from `src/content/before-after.ts`.
 */
const CONTEXT: Record<Mode, { label: string; value: string | null; icon: typeof Target }[]> = {
  amnesia: [
    { label: "Profile", value: null, icon: Target },
    { label: "Recalled memories", value: null, icon: History },
    { label: "Saved after the reply", value: null, icon: NotebookPen },
  ],
  memory: [
    { label: "Target role", value: "Backend engineer · interview in 12 days", icon: Target },
    { label: "Mistake", value: "Skips the Result in STAR answers", icon: AlertTriangle },
    { label: "Learning style", value: "Examples first, short feedback", icon: GraduationCap },
  ],
};

const BEHAVIOUR: Record<Mode, string> = {
  amnesia:
    "Starts from zero: asks for your role, level and goals again, then picks a generic question.",
  memory:
    "Opens with a question aimed at your last mistake, keeps feedback short, and checks whether the Result is there this time.",
};

function Transcript({ turns, label }: { turns: TranscriptTurn[]; label: string }) {
  return (
    <ol className="space-y-3 text-sm" aria-label={label}>
      {turns.map((t, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static transcript, never reordered
        <li key={`${t.role}-${i}`} className={cn("max-w-[85%]", t.role === "user" && "ml-auto")}>
          <p className="mb-1 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            {t.role === "user" ? "Tester" : "Coach"}
          </p>
          <p
            className={cn(
              "px-3 py-2 whitespace-pre-wrap",
              t.role === "user"
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-background",
            )}
          >
            {t.text}
          </p>
        </li>
      ))}
    </ol>
  );
}

function ModeTabs({
  mode,
  setMode,
  panelId,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  panelId: string;
}) {
  const tabs: { id: Mode; label: string; icon: typeof EyeOff }[] = [
    { id: "amnesia", label: "Amnesia Mode", icon: EyeOff },
    { id: "memory", label: "With memory", icon: History },
  ];
  return (
    <div
      role="tablist"
      aria-label="Compare modes"
      className="relative inline-grid grid-cols-2 border border-border bg-muted p-1"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          const next = mode === "amnesia" ? "memory" : "amnesia";
          setMode(next);
          e.currentTarget.querySelector<HTMLButtonElement>(`[data-mode="${next}"]`)?.focus();
        }
      }}
    >
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          data-mode={id}
          aria-selected={mode === id}
          aria-controls={panelId}
          tabIndex={mode === id ? 0 : -1}
          onClick={() => setMode(id)}
          className={cn(
            "relative z-10 inline-flex h-9 items-center justify-center gap-2 px-3 text-sm transition-colors sm:px-4",
            mode === id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {mode === id && (
            <motion.span
              layoutId="mode-pill"
              className="absolute inset-0 -z-10 border border-border bg-card shadow-sm"
              transition={{ type: "spring", stiffness: 420, damping: 36 }}
            />
          )}
          <Icon
            className={cn("size-4", id === "memory" && mode === id && "text-link")}
            aria-hidden
          />
          {label}
        </button>
      ))}
    </div>
  );
}

export function BeforeAfter() {
  const [mode, setMode] = useState<Mode>("memory");
  const panelId = useId();
  const reduce = usePrefersReducedMotion();
  const swap = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 10, filter: "blur(4px)" },
        animate: { opacity: 1, y: 0, filter: "blur(0px)" },
        exit: { opacity: 0, y: -8, filter: "blur(4px)" },
      };

  return (
    <Section
      id="before-after"
      eyebrow="The difference"
      title="Same question, with and without memory"
      intro="Every session starts with a recall step. Switch modes to see what the coach knows before it says a word."
      className="border-t border-border"
    >
      <div className="grid items-start gap-10 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-4">
          <ModeTabs mode={mode} setMode={setMode} panelId={panelId} />

          <div
            id={panelId}
            role="tabpanel"
            aria-label={mode === "memory" ? "With memory" : "Amnesia Mode"}
            className={cn(
              "relative overflow-hidden border bg-card transition-colors duration-500",
              mode === "memory" ? "border-ring/50" : "border-border",
            )}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <span className="font-mono text-[11px] text-muted-foreground">
                coach · new session
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 px-2 py-0.5 font-mono text-[11px]",
                  mode === "memory"
                    ? "bg-memory text-memory-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {mode === "memory" ? "memory on" : "memory off"}
              </span>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={mode}
                {...swap}
                transition={{ duration: 0.35, ease: EASE }}
                className="space-y-5 p-4 sm:p-5"
              >
                {beforeAfter ? (
                  <Transcript
                    turns={mode === "memory" ? beforeAfter.memory : beforeAfter.amnesia}
                    label={mode === "memory" ? "Memory transcript" : "Amnesia Mode transcript"}
                  />
                ) : (
                  <>
                    <div className="ml-auto w-fit max-w-[85%] bg-primary px-3 py-2 text-sm text-primary-foreground">
                      {OPENING}
                    </div>
                    <div>
                      <p className="mb-2 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                        Before replying, the coach receives
                      </p>
                      <ul className="grid gap-2">
                        {CONTEXT[mode].map(({ label, value, icon: Icon }, i) => (
                          <motion.li
                            key={label}
                            initial={reduce ? false : { opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: reduce ? 0 : 0.1 + i * 0.08, duration: 0.3 }}
                            className={cn(
                              "flex items-start gap-3 px-3 py-2.5 text-sm",
                              value
                                ? "border border-border bg-background"
                                : "border border-dashed border-border",
                            )}
                          >
                            <Icon
                              className={cn(
                                "mt-0.5 size-4 shrink-0",
                                value ? "text-link" : "text-muted-foreground",
                              )}
                              aria-hidden
                            />
                            <span className="min-w-0">
                              <span className="block font-medium">{label}</span>
                              <span className="block text-muted-foreground">
                                {value ?? "Nothing — memory is off"}
                              </span>
                            </span>
                          </motion.li>
                        ))}
                      </ul>
                    </div>
                    <div className="border-l-2 border-ring/60 pl-3">
                      <p className="mb-1 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                        So it
                      </p>
                      <p className="text-sm leading-relaxed">{BEHAVIOUR[mode]}</p>
                    </div>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
          <p className="text-xs text-muted-foreground">
            {beforeAfter
              ? beforeAfter.attribution
              : "Illustrative example of what gets recalled — not a real user's data."}
          </p>
        </div>

        <div className="space-y-6 lg:pt-14">
          <dl className="grid grid-cols-2 gap-px border border-border bg-border">
            {[
              { k: "Recall before every reply", v: "Profile + relevant notes" },
              { k: "Saved to Walrus after every reply", v: "Short notes, not transcripts" },
              { k: "Amnesia Mode", v: "Recalls and saves nothing" },
              { k: "If memory is down", v: "Coaching continues, honestly" },
            ].map(({ k, v }) => (
              <div key={k} className="bg-card p-4">
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="mt-1 text-sm font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="space-y-3">
            <p className="leading-relaxed text-muted-foreground">
              Try it yourself: turn on{" "}
              <span className="text-foreground">“Start without memory”</span> on the coach's home
              screen, ask this opening line, then ask it again in a normal session.
            </p>
            <button
              type="button"
              onClick={() => openCoachWidget()}
              className="group inline-flex items-center gap-2 text-sm font-medium text-link"
            >
              Open the coach
              <ArrowRight
                className="size-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </button>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* What it remembers — bento                                            */
/* ------------------------------------------------------------------ */

const TIMELINE = [
  {
    when: "Session 1",
    icon: AlertTriangle,
    label: "Mistake saved",
    text: "Skipped the Result in a STAR answer",
    tone: "text-warning-foreground bg-warning",
  },
  {
    when: "Session 2",
    icon: History,
    label: "Recalled",
    text: "Coach asks for the Result before you finish",
    tone: "text-link bg-accent",
  },
  {
    when: "Session 3",
    icon: TrendingUp,
    label: "Improvement",
    text: "Result landed three answers in a row",
    tone: "text-memory-foreground bg-memory",
  },
];

function ProgressTile() {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.4 });
  const reduce = usePrefersReducedMotion();
  return (
    <div
      ref={ref}
      className="relative flex h-full flex-col overflow-hidden border border-border bg-card p-6 sm:p-7"
    >
      <p className="font-mono text-[11px] tracking-[0.18em] text-link uppercase">
        Mistakes → progress
      </p>
      <h3 className="mt-2 text-xl font-semibold tracking-tight">
        It remembers what tripped you up — and notices when it stops.
      </h3>
      <ol className="relative mt-7 space-y-5">
        <span aria-hidden className="absolute top-2 bottom-2 left-3.75 w-px bg-border" />
        <motion.span
          aria-hidden
          className="absolute top-2 bottom-2 left-3.75 w-px origin-top bg-primary"
          initial={false}
          animate={{ scaleY: seen ? 1 : 0 }}
          transition={{ duration: reduce ? 0 : 1.4, ease: EASE }}
        />
        {TIMELINE.map(({ when, icon: Icon, label, text, tone }, i) => (
          <motion.li
            key={when}
            className="relative flex gap-4"
            initial={false}
            animate={seen ? { opacity: 1, y: 0 } : { opacity: reduce ? 1 : 0, y: reduce ? 0 : 10 }}
            transition={{ delay: reduce ? 0 : 0.2 + i * 0.35, duration: 0.45, ease: EASE }}
          >
            <span
              className={cn("relative z-10 flex size-8 shrink-0 items-center justify-center", tone)}
            >
              <Icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 pt-0.5">
              <span className="block font-mono text-[11px] text-muted-foreground">
                {when} · {label}
              </span>
              <span className="block text-sm">{text}</span>
            </span>
          </motion.li>
        ))}
      </ol>
      <p className="mt-auto pt-6 text-xs text-muted-foreground">Illustrative sequence.</p>
    </div>
  );
}

function NotTranscriptTile() {
  return (
    <div className="relative flex h-full flex-col gap-4 overflow-hidden border border-border bg-card p-6">
      <div>
        <p className="font-mono text-[11px] tracking-[0.18em] text-link uppercase">
          Notes, not transcripts
        </p>
        <h3 className="mt-2 text-lg font-semibold tracking-tight">
          Transcripts are for you; memories are for the coach.
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Your conversation is saved encrypted for your History (or not at all, with history off).
          Across sessions the coach carries only short notes like this one.
        </p>
      </div>
      <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <div aria-hidden className="space-y-1.5 border border-dashed border-border p-3">
          {[92, 80, 96, 64, 88].map((w) => (
            <span
              key={w}
              className="block h-1.5 bg-muted-foreground/25"
              style={{ width: `${w}%` }}
            />
          ))}
          <span className="block pt-1 font-mono text-[10px] text-muted-foreground">
            transcript · yours, encrypted
          </span>
        </div>
        <ArrowRight
          className="mx-auto size-4 rotate-90 text-muted-foreground sm:rotate-0"
          aria-hidden
        />
        <div className="flex items-start gap-2 border border-ring/50 bg-background p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-link" aria-hidden />
          <span>
            <span className="block font-mono text-[10px] text-muted-foreground">
              mistake · on Walrus
            </span>
            Skips the Result in STAR answers
          </span>
        </div>
      </div>
    </div>
  );
}

const SMALL_TILES = [
  {
    icon: Target,
    title: "Target role & date",
    body: "The role, company and level you're aiming for, and when the interview is — so plans fit the time left.",
  },
  {
    icon: GraduationCap,
    title: "How you learn",
    body: "Examples or theory first, short or detailed feedback, how you like to be coached.",
  },
  {
    icon: ThumbsUp,
    title: "Strengths",
    body: "What you already do well, so practice time goes where it matters.",
  },
  {
    icon: Flag,
    title: "Goals",
    body: "What you want to practise next — picked up at the start of the next session.",
  },
] as const;

export function WhatItRemembers() {
  return (
    <Section
      id="what-it-remembers"
      eyebrow="Memory"
      title="What it remembers"
      intro="Eight kinds of note, each saved as its own encrypted blob on Walrus — and each visible to you in “What I remember”."
      className="border-t border-border bg-[color-mix(in_oklab,var(--muted)_45%,transparent)]"
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="md:row-span-2 lg:col-span-2">
          <ProgressTile />
        </div>
        {SMALL_TILES.map((t) => {
          const Icon = t.icon;
          return (
            <div
              key={t.title}
              className="group border border-border bg-card p-5 transition-colors hover:border-ring/50"
            >
              <span className="flex size-9 items-center justify-center border border-border bg-background transition-colors group-hover:border-ring/60 group-hover:bg-accent">
                <Icon className="size-4 text-link" aria-hidden />
              </span>
              <h3 className="mt-4 font-medium">{t.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t.body}</p>
            </div>
          );
        })}
        <div className="md:col-span-2 lg:col-span-4">
          <NotTranscriptTile />
        </div>
      </div>
    </Section>
  );
}
