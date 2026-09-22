"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { OpenCoachButton } from "./open-coach-button";

const MARGIN_NOTES = [
  {
    kind: "Mistake",
    when: "last Tuesday",
    text: "Skipped the Result in a STAR answer about a missed deadline.",
  },
  {
    kind: "Target",
    when: "onboarding",
    text: "Backend engineer, payments company, interview on the 15th.",
  },
  { kind: "Learns best", when: "onboarding", text: "Examples first, concise feedback." },
];

/**
 * The page's one orchestrated moment: margin notes are "pinned" beside a
 * coaching reply, one after another — memory as marginalia. Illustrative
 * content only (labelled as such).
 */
function MemoryMargin() {
  const reduce = useReducedMotion();
  return (
    <figure className="relative" aria-labelledby="hero-illustration-caption">
      <div className="grid gap-4 md:grid-cols-[1fr_13rem] md:gap-0">
        <div className="relative border border-border bg-card p-5 md:border-r-0">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_27px,var(--border)_27px,var(--border)_28px)] bg-[position:0_20px] opacity-70"
          />
          <div className="relative space-y-7 text-sm leading-7">
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">You</span> — Let's practice. What should
              I work on?
            </p>
            <p>
              <span className="font-medium">Coach</span> — Last Tuesday you told a strong story
              about the missed launch but stopped before the result. Let's fix that first: same
              question, and this time end with the number. What changed because of what you did?
            </p>
          </div>
        </div>
        <ol
          className="space-y-3 md:border md:border-border md:bg-background md:p-3"
          aria-label="Notes the coach recalled"
        >
          {MARGIN_NOTES.map((note, i) => (
            <motion.li
              key={note.kind}
              initial={reduce ? false : { opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: reduce ? 0 : 0.5 + i * 0.35, duration: 0.35, ease: "easeOut" }}
              className="border-l-2 border-link bg-accent px-3 py-2 text-xs text-accent-foreground"
            >
              <p className="flex justify-between gap-2">
                <span className="font-medium">{note.kind}</span>
                <span className="font-mono text-[11px] opacity-80">{note.when}</span>
              </p>
              <p className="mt-0.5 leading-snug">{note.text}</p>
            </motion.li>
          ))}
        </ol>
      </div>
      <figcaption id="hero-illustration-caption" className="mt-3 text-xs text-muted-foreground">
        Illustration with example notes — not a real user. Real recalled notes link to their
        encrypted blob on Walrus.
      </figcaption>
    </figure>
  );
}

export function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:py-24">
      <div className="space-y-6">
        <h1 className="max-w-[16ch] text-4xl font-semibold leading-[1.05] tracking-tight text-balance sm:text-5xl lg:text-6xl">
          {siteConfig.tagline}
        </h1>
        <p className="max-w-[58ch] text-lg leading-relaxed text-muted-foreground">
          {siteConfig.description}
        </p>
        <div className="flex flex-wrap gap-3">
          <OpenCoachButton className="h-11 px-5 text-sm">Start practicing</OpenCoachButton>
          <Button asChild variant="outline" className="h-11 px-5 text-sm">
            <Link href="#before-after">See it remember</Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Sign in with Google. <kbd className="font-mono">Ctrl</kbd>/
          <kbd className="font-mono">⌘</kbd> + <kbd className="font-mono">K</kbd> opens the coach
        </p>
      </div>
      <MemoryMargin />
    </section>
  );
}
