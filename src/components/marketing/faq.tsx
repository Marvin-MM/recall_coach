"use client";

import {
  Brain,
  Cpu,
  EyeOff,
  HardDrive,
  HelpCircle,
  KeyRound,
  LifeBuoy,
  type LucideIcon,
  MessageSquareText,
  ScrollText,
  ShieldCheck,
  Target,
  Trash2,
  TrendingUp,
  WifiOff,
} from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { openCoachWidget } from "@/components/widget/widget-events";
import { cn } from "@/lib/utils";

type Category = "General" | "Memory & privacy" | "Coaching" | "Technical";
const CATEGORIES: readonly Category[] = ["General", "Memory & privacy", "Coaching", "Technical"];

const FAQ: { cat: Category; icon: LucideIcon; q: string; a: string }[] = [
  {
    cat: "General",
    icon: HelpCircle,
    q: "What is Callback?",
    a: "An interview and skill coach that remembers your target role, how you learn, what tripped you up and how far you've come — across every session and every device.",
  },
  {
    cat: "General",
    icon: KeyRound,
    q: "Do I need an account?",
    a: "Yes — sign in with Google so your memories follow you across devices. We request only the openid, email and profile scopes.",
  },
  {
    cat: "General",
    icon: EyeOff,
    q: "Can I practise without it remembering?",
    a: "Yes. Turn on “Start without memory” before a session. Amnesia Mode recalls nothing and saves nothing, which is also a handy way to compare.",
  },
  {
    cat: "Memory & privacy",
    icon: Brain,
    q: "What does it remember, exactly?",
    a: "Short notes such as your target role, interview date, learning style, specific mistakes, strengths, goals and improvements. Not your full conversation.",
  },
  {
    cat: "Memory & privacy",
    icon: ShieldCheck,
    q: "Who can read my memories?",
    a: "Notes are encrypted with Seal before they're stored on Walrus, and only this coach's delegate key can decrypt them. Your namespace is derived on our server from your account, never from anything a browser sends.",
  },
  {
    cat: "Memory & privacy",
    icon: Trash2,
    q: "Can I delete a memory?",
    a: "Not from inside Callback yet. Walrus Memory supports permanently deleting stored memories, but Callback doesn't have a delete control for it so far. Until it does, setup asks for consent first, and Amnesia Mode lets you practise without saving anything.",
  },
  {
    cat: "Memory & privacy",
    icon: ScrollText,
    q: "Do you store my conversations?",
    a: "Only for you, and only if you want. Transcripts are for you; memories are for the coach. With history on (the default), your conversations are stored encrypted so you can reread them in History and pick up an unfinished session. The coach reads only the current session's messages — across sessions it uses nothing but the short memories on Walrus. Turn history off or delete it in Settings; deleting history doesn't delete memories.",
  },
  {
    cat: "Coaching",
    icon: Target,
    q: "What can I practise?",
    a: "Mock interviews one question at a time — scored on structure, specificity, impact and communication, with one concrete fix after each answer. You can also drill a weak spot it has noticed, review your progress, or just chat.",
  },
  {
    cat: "Coaching",
    icon: TrendingUp,
    q: "How does it track progress?",
    a: "When a mistake it remembered stops showing up in your answers, it saves an improvement. “What I remember” shows every note, grouped by kind.",
  },
  {
    cat: "Technical",
    icon: Cpu,
    q: "Which AI model is it?",
    a: "Qwen 3.8 27B running on Groq, called through the Vercel AI SDK. Memory is handled by Walrus Memory, not by the model provider.",
  },
  {
    cat: "Technical",
    icon: HardDrive,
    q: "What are Walrus and Walrus Memory?",
    a: "Walrus is a decentralized storage network built on Sui. Walrus Memory is a memory layer on top of it: it embeds, encrypts and stores notes, then recalls the relevant ones by meaning.",
  },
  {
    cat: "Technical",
    icon: WifiOff,
    q: "What if memory is down?",
    a: "Coaching continues. You'll see a notice that memory is temporarily unavailable, and the coach won't pretend to remember anything.",
  },
];

export function Faq() {
  const [cat, setCat] = useState<Category>("General");
  const items = FAQ.filter((f) => f.cat === cat);

  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 border-t border-border">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="space-y-3 text-center">
          <p className="font-mono text-[11px] tracking-[0.18em] text-link uppercase">FAQ</p>
          <h2 id="faq-title" className="text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">
            Questions, answered
          </h2>
          <p className="text-muted-foreground">
            Can't find what you're looking for?{" "}
            <button
              type="button"
              onClick={() => openCoachWidget()}
              className="font-medium text-link underline underline-offset-4"
            >
              Ask the coach
            </button>
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Question categories"
          className="-mx-4 mt-10 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0"
          onKeyDown={(e) => {
            const i = CATEGORIES.indexOf(cat);
            const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
            if (!delta) return;
            e.preventDefault();
            const next = CATEGORIES[(i + delta + CATEGORIES.length) % CATEGORIES.length];
            if (!next) return;
            setCat(next);
            e.currentTarget.querySelector<HTMLButtonElement>(`[data-cat="${next}"]`)?.focus();
          }}
        >
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              data-cat={c}
              id={`faq-tab-${c}`}
              aria-selected={cat === c}
              aria-controls="faq-panel"
              tabIndex={cat === c ? 0 : -1}
              onClick={() => setCat(c)}
              className={cn(
                "relative h-9 shrink-0 rounded-full border px-4 text-sm whitespace-nowrap transition-colors",
                cat === c
                  ? "border-foreground text-background"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {cat === c && (
                <motion.span
                  layoutId="faq-pill"
                  className="absolute inset-0 -z-0 rounded-full bg-foreground"
                  transition={{ type: "spring", stiffness: 420, damping: 36 }}
                />
              )}
              <span className="relative">{c}</span>
            </button>
          ))}
        </div>

        <div id="faq-panel" role="tabpanel" aria-labelledby={`faq-tab-${cat}`} className="mt-8">
          <Accordion
            type="single"
            collapsible
            defaultValue={items[0]?.q ?? ""}
            key={cat}
            className="space-y-2"
          >
            {items.map(({ icon: Icon, q, a }) => (
              <AccordionItem
                key={q}
                value={q}
                className="border border-border bg-card px-4 transition-colors data-[state=open]:border-ring/40 last:border-b"
              >
                <AccordionTrigger className="items-center gap-4 py-4 text-left text-[15px] font-medium hover:no-underline">
                  <span className="flex items-center gap-4">
                    <span className="flex size-9 shrink-0 items-center justify-center border border-border bg-background">
                      <Icon className="size-4 text-link" aria-hidden />
                    </span>
                    {q}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pl-13 text-sm leading-relaxed text-muted-foreground">
                  {a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        <div className="mt-10 flex flex-col items-center gap-3 border border-dashed border-border p-6 text-center sm:flex-row sm:text-left">
          <span className="flex size-10 shrink-0 items-center justify-center bg-accent">
            <LifeBuoy className="size-5 text-link" aria-hidden />
          </span>
          <p className="text-sm text-muted-foreground sm:mr-auto">
            <span className="block font-medium text-foreground">Still curious how it works?</span>
            The privacy page covers exactly what's stored, where, and what never is.
          </p>
          <a
            href="/privacy"
            className="inline-flex items-center gap-2 text-sm font-medium text-link hover:underline"
          >
            <MessageSquareText className="size-4" aria-hidden /> Privacy details
          </a>
        </div>
      </div>
    </section>
  );
}
