"use client";

import { motion, useInView, useScroll, useSpring } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { PracticeScene, ProfileScene, RecallScene, RememberScene } from "./iso/step-scenes";

const STEPS = [
  {
    title: "Tell it your target",
    body: "Role, company, interview date and how you like to learn — three short steps. This becomes your profile, the first thing the coach reads every session.",
    tag: "Onboarding",
    Scene: ProfileScene,
  },
  {
    title: "Practice one question at a time",
    body: "Mock interviews scored against a rubric, with one concrete fix after every answer — not a wall of feedback.",
    tag: "Coaching",
    Scene: PracticeScene,
  },
  {
    title: "Memories saved to Walrus",
    body: "After each reply, short notes — a mistake, a strength, a goal — are encrypted with Seal and stored on Walrus Mainnet. Your transcript isn't.",
    tag: "Walrus Memory",
    Scene: RememberScene,
  },
  {
    title: "Next session, it adapts",
    body: "The coach recalls what matters before answering, opens where you left off, and logs an improvement when an old mistake stops showing up.",
    tag: "Recall",
    Scene: RecallScene,
  },
] as const;

/** Below lg each step shows its own scene, played once when scrolled into view. */
function MobileScene({ Scene }: { Scene: (typeof STEPS)[number]["Scene"] }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.4 });
  return (
    <div ref={ref} className="deep relative mt-5 overflow-hidden border border-border lg:hidden">
      <div aria-hidden className="blueprint-grid absolute inset-0 opacity-60" />
      <Scene active={seen} />
    </div>
  );
}

function Step({
  index,
  active,
  onActive,
}: {
  index: number;
  active: boolean;
  onActive: (i: number) => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const inView = useInView(ref, { margin: "-45% 0px -45% 0px" });
  const step = STEPS[index];

  useEffect(() => {
    if (inView) onActive(index);
  }, [inView, index, onActive]);

  if (!step) return null;
  const { Scene } = step;

  return (
    <li ref={ref} className="relative pl-14 lg:flex lg:min-h-[62svh] lg:items-center lg:pl-16">
      {/* Rail marker */}
      <span
        aria-hidden
        className={cn(
          "absolute top-0 left-0 flex size-10 items-center justify-center border font-mono text-sm transition-colors duration-300 lg:top-1/2 lg:-translate-y-1/2",
          active
            ? "border-primary bg-primary text-primary-foreground shadow-[0_0_0_6px_color-mix(in_oklab,var(--primary)_18%,transparent)]"
            : "border-border bg-background text-muted-foreground",
        )}
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      {/* Inactive steps recede by colour, not opacity, so text keeps AA contrast. */}
      <div className="space-y-3">
        <p className="font-mono text-[11px] tracking-[0.18em] text-link uppercase">{step.tag}</p>
        <h3
          className={cn(
            "text-2xl font-semibold tracking-tight transition-colors duration-500 sm:text-[1.7rem]",
            !active && "lg:text-muted-foreground",
          )}
        >
          {step.title}
        </h3>
        <p className="max-w-[46ch] leading-relaxed text-muted-foreground">{step.body}</p>
        {/* Mobile / tablet: each step carries its own scene */}
        <MobileScene Scene={Scene} />
      </div>
    </li>
  );
}

export function HowItWorks() {
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLOListElement>(null);
  const reduce = usePrefersReducedMotion();
  const { scrollYProgress } = useScroll({ target: listRef, offset: ["start 55%", "end 55%"] });
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30, restDelta: 0.001 });

  return (
    <section id="how-it-works" aria-labelledby="how-it-works-title" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="max-w-2xl space-y-3">
          <p className="font-mono text-[11px] tracking-[0.18em] text-link uppercase">
            How it works
          </p>
          <h2
            id="how-it-works-title"
            className="text-3xl font-semibold tracking-[-0.025em] text-balance sm:text-4xl"
          >
            From first answer to lasting progress
          </h2>
          <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
            Four steps, one loop. Every session makes the next one sharper.
          </p>
        </div>

        <div className="mt-12 grid gap-12 lg:mt-4 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          {/* Desktop: sticky scene stage that crossfades between steps */}
          <div className="hidden lg:block">
            <div className="deep sticky top-24 h-[min(calc(100svh-8rem),640px)] overflow-hidden border border-border">
              <div aria-hidden className="blueprint-grid absolute inset-0 opacity-70" />
              <div
                aria-hidden
                className="absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_100%,rgb(29_78_216/0.45),transparent_70%)]"
              />
              {STEPS.map(({ Scene, title }, i) => (
                <motion.div
                  key={title}
                  className="absolute inset-0 flex items-center justify-center p-6"
                  initial={false}
                  animate={{
                    opacity: active === i ? 1 : 0,
                    scale: reduce ? 1 : active === i ? 1 : 0.94,
                    filter: reduce || active === i ? "blur(0px)" : "blur(6px)",
                  }}
                  transition={{ duration: reduce ? 0.15 : 0.6, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Scene active={active === i} />
                </motion.div>
              ))}
              <div
                aria-hidden
                className="absolute inset-x-0 bottom-0 flex items-center justify-between border-t border-white/10 px-4 py-3 font-mono text-[11px] text-white/60"
              >
                <span>
                  {String(active + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")} ·{" "}
                  {STEPS[active]?.tag}
                </span>
                <span>Illustrative</span>
              </div>
            </div>
          </div>

          <div className="relative">
            {/* Rail track + scroll-linked fill */}
            <div aria-hidden className="absolute top-0 bottom-0 left-5 w-px bg-border" />
            <motion.div
              aria-hidden
              className="absolute top-0 bottom-0 left-5 w-px origin-top bg-primary"
              style={{ scaleY: progress }}
            />
            <ol ref={listRef} className="relative space-y-14 lg:space-y-0">
              {STEPS.map((s, i) => (
                <Step key={s.title} index={i} active={active === i} onActive={setActive} />
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
