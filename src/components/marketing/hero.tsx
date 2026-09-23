"use client";

import { ArrowRight, Boxes, Database, KeyRound, Network, Zap } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { openCoachWidget, prefetchCoachWidget } from "@/components/widget/widget-events";
import { siteConfig } from "@/config/site";
import { usePrefersReducedMotion } from "@/hooks/use-media-query";
import type { HealthDto } from "@/types/api";
import { MemoryStack } from "./iso/memory-stack";

const BUILT_ON = [
  { name: "Walrus Memory", icon: Database },
  { name: "Walrus", icon: Boxes },
  { name: "Seal", icon: KeyRound },
  { name: "Sui", icon: Network },
  { name: "Qwen on Groq", icon: Zap },
];

function RelayerStatus() {
  const [state, setState] = useState<"checking" | "ok" | "down">("checking");
  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((r) => r.json() as Promise<HealthDto>)
      .then((h) => !cancelled && setState(h.relayer === "ok" ? "ok" : "down"))
      .catch(() => !cancelled && setState("down"));
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <span className="inline-flex items-center gap-2 border border-white/15 px-2.5 py-1 font-mono text-[11px] text-white/70">
      Memory network
      <span className="inline-flex items-center gap-1.5 text-white">
        <span
          aria-hidden
          className={`size-1.5 ${state === "ok" ? "bg-[#97f0e5]" : state === "down" ? "bg-[#ff6b62]" : "animate-pulse bg-white/60"}`}
        />
        <span aria-live="polite">
          {state === "ok" ? "Live on Mainnet" : state === "down" ? "Degraded" : "Checking"}
        </span>
      </span>
    </span>
  );
}

export function Hero() {
  const reduce = usePrefersReducedMotion();
  // Always animate to visible: the server renders the entrance state, so a
  // reduced-motion client must still resolve to opacity 1 (just without travel).
  const fade = (delay: number) => ({
    initial: { opacity: 0, y: reduce ? 0 : 14 },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: reduce ? 0.01 : 0.6,
      delay: reduce ? 0 : delay,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  });

  return (
    <section
      aria-labelledby="hero-title"
      data-band="deep"
      className="deep relative isolate overflow-hidden"
    >
      {/* Ocean glow + blueprint grid */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_85%_120%,#1d4ed8_0%,rgb(29_78_216/0.55)_30%,transparent_65%),radial-gradient(90%_70%_at_0%_110%,#2563eb_0%,transparent_60%),radial-gradient(60%_50%_at_70%_40%,rgb(77_162_255/0.18),transparent_70%)]"
      />
      <div
        aria-hidden
        className="blueprint-grid absolute inset-0 -z-10 [mask-image:radial-gradient(80%_70%_at_70%_40%,black,transparent)]"
      />

      <div className="mx-auto grid max-w-6xl items-center gap-6 px-4 pt-28 pb-10 sm:px-6 lg:min-h-[min(calc(100svh-7rem),760px)] lg:grid-cols-[1.05fr_1fr] lg:pt-28 lg:pb-6">
        <div className="relative z-10 space-y-7">
          <motion.div className="flex flex-wrap gap-2" {...fade(0)}>
            <span className="inline-flex items-center border border-white/15 bg-white/5 px-2.5 py-1 font-mono text-[11px] text-white/80">
              Seal-encrypted on Walrus
            </span>
            <RelayerStatus />
          </motion.div>

          <motion.h1
            id="hero-title"
            className="text-[2.5rem] leading-[1.04] font-semibold tracking-[-0.035em] text-balance sm:text-6xl lg:text-[3.6rem] xl:text-[3.9rem]"
            {...fade(0.08)}
          >
            <span className="block text-white/55">The interview coach</span>{" "}
            <span className="block text-white">that remembers your last mistake.</span>
          </motion.h1>

          <motion.p
            className="max-w-[52ch] text-base leading-relaxed text-white/70 sm:text-lg"
            {...fade(0.16)}
          >
            {siteConfig.description}
          </motion.p>

          <motion.div className="flex flex-wrap items-center gap-3" {...fade(0.24)}>
            <button
              type="button"
              onClick={() => openCoachWidget()}
              onPointerEnter={() => prefetchCoachWidget()}
              onFocus={() => prefetchCoachWidget()}
              className="group inline-flex h-12 items-stretch border border-[#7cbcff]/50 bg-[linear-gradient(180deg,#7cbcff,#4da2ff)] text-sm font-medium text-[#0b0f14] shadow-[0_12px_40px_-12px_rgb(77_162_255/0.8)]"
            >
              <span className="flex items-center px-5">Start practicing</span>
              <span className="flex w-12 items-center justify-center border-l border-[#0b0f14]/15 bg-[#1d4ed8] text-white transition-colors group-hover:bg-[#1e40af]">
                <ArrowRight
                  className="size-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </span>
            </button>
            <Link
              href="#how-it-works"
              className="inline-flex h-12 items-center px-4 text-sm text-white/75 underline-offset-4 hover:text-white hover:underline"
            >
              See how it remembers
            </Link>
          </motion.div>
        </div>

        <motion.figure
          className="relative -mx-4 sm:mx-auto sm:w-full sm:max-w-md lg:max-w-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduce ? 0.01 : 1 }}
        >
          <MemoryStack />
          <figcaption className="sr-only">
            Illustration: memories flow from the coach into Walrus Memory, stored as encrypted blobs
            on Walrus storage nodes.
          </figcaption>
        </motion.figure>
      </div>

      <div className="relative mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <p className="mb-4 font-mono text-[11px] tracking-[0.16em] text-white/55">
          BUILT ON THE SUI STACK
        </p>
        <ul className="flex flex-wrap items-center gap-x-8 gap-y-4">
          {BUILT_ON.map(({ name, icon: Icon }) => (
            <li
              key={name}
              className="flex items-center gap-2 text-base font-medium tracking-tight text-white/80 sm:text-lg"
            >
              <Icon className="size-5 text-[#7cbcff]" aria-hidden />
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
