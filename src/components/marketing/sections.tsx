import { EyeOff, History } from "lucide-react";
import { KIND_META } from "@/components/widget/kind-meta";
import { beforeAfter, type TranscriptTurn } from "@/content/before-after";
import type { MemoryKind } from "@/types/domain";

function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="border-t border-border">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-16 sm:px-6">
        <div className="max-w-2xl space-y-2">
          <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {title}
          </h2>
          {intro && <p className="text-muted-foreground">{intro}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

const STEPS = [
  {
    title: "Tell it your target",
    body: "Role, company, interview date, and how you like to learn. Three short steps.",
  },
  {
    title: "Practice",
    body: "Mock interviews one question at a time, with a rubric score and one concrete fix after every answer.",
  },
  {
    title: "It remembers and adapts",
    body: "Mistakes, strengths and progress are saved to Walrus. Next session opens where you left off.",
  },
];

export function HowItWorks() {
  return (
    <Section id="how-it-works" title="How it works">
      <ol className="grid gap-8 md:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="space-y-2">
            <p className="font-mono text-sm text-link">{i + 1}</p>
            <h3 className="text-lg font-medium">{step.title}</h3>
            <p className="max-w-[40ch] text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Transcript({ turns, label }: { turns: TranscriptTurn[]; label: string }) {
  return (
    <ol className="space-y-3 text-sm" aria-label={label}>
      {turns.map((t, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static transcript, never reordered
        <li key={`${t.role}-${i}`}>
          <span className="font-medium">{t.role === "user" ? "Tester" : "Coach"}</span>
          <p className="mt-0.5 whitespace-pre-wrap text-foreground">{t.text}</p>
        </li>
      ))}
    </ol>
  );
}

export function BeforeAfter() {
  return (
    <Section
      id="before-after"
      title="Same question, with and without memory"
      intro="One tester, same opening line: “Let's practice. What should I work on?” — once in Amnesia Mode, once with memory after two earlier sessions."
    >
      {beforeAfter ? (
        <div className="space-y-3">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="border border-border bg-card p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <EyeOff className="size-4" aria-hidden /> Amnesia Mode
              </h3>
              <Transcript turns={beforeAfter.amnesia} label="Amnesia Mode transcript" />
            </div>
            <div className="border border-ring/60 bg-card p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-link">
                <History className="size-4" aria-hidden /> With memory
              </h3>
              <Transcript turns={beforeAfter.memory} label="Memory transcript" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{beforeAfter.attribution}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2" role="note">
          <div className="border border-dashed border-border p-5 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <EyeOff className="size-4" aria-hidden /> Amnesia Mode
            </p>
            <p className="mt-2 text-muted-foreground">
              A real transcript from a consenting tester goes here. We don't publish invented
              conversations.
            </p>
          </div>
          <div className="border border-dashed border-ring/60 p-5 text-sm">
            <p className="flex items-center gap-2 font-medium text-link">
              <History className="size-4" aria-hidden /> With memory
            </p>
            <p className="mt-2 text-muted-foreground">
              Try it yourself: toggle “Start without memory” on the coach's home screen, then run
              the same opening line in a normal session.
            </p>
          </div>
        </div>
      )}
    </Section>
  );
}

const REMEMBERED: { kind: MemoryKind; body: string }[] = [
  { kind: "target_role", body: "The role, company and level you're aiming for." },
  { kind: "interview_date", body: "When the interview is, so plans fit the time left." },
  { kind: "learning_style", body: "Examples or theory first, short or detailed feedback." },
  {
    kind: "mistake",
    body: "Specific slips, like skipping the Result or forgetting failure modes.",
  },
  { kind: "strength", body: "What you already do well, so practice time goes elsewhere." },
  { kind: "improvement", body: "A past mistake you've stopped making — logged as progress." },
  { kind: "goal", body: "What you want to practise next." },
  { kind: "preference", body: "How you like to be coached." },
];

export function WhatItRemembers() {
  return (
    <Section
      id="what-it-remembers"
      title="What it remembers"
      intro="Short, self-contained notes — never your full transcript."
    >
      <dl className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
        {REMEMBERED.map(({ kind, body }) => {
          const meta = KIND_META[kind];
          const Icon = meta.icon;
          return (
            <div key={kind} className="border-b border-border pb-4 pl-7">
              <dt className="relative font-medium">
                <Icon className="absolute top-0.5 -left-7 size-4 text-link" aria-hidden />
                {meta.label}
              </dt>
              <dd className="text-sm text-muted-foreground">{body}</dd>
            </div>
          );
        })}
      </dl>
    </Section>
  );
}

export { Section };
