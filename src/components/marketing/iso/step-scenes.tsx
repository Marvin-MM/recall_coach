"use client";

import { Check, Lock } from "lucide-react";
import { motion } from "motion/react";
import { usePrefersReducedMotion } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

/**
 * Isometric scenes for "How it works" — one per step. Pure CSS 3D + motion,
 * decorative (aria-hidden). Each scene replays its build-up when it becomes
 * active; under reduced motion layers simply fade in place.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

function Slab({
  z,
  delay = 0,
  active,
  className,
  children,
}: {
  z: number;
  delay?: number;
  active: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const reduce = usePrefersReducedMotion();
  return (
    <motion.div
      className="iso-layer"
      initial={false}
      animate={active ? { opacity: 1, z } : { opacity: 0, z: reduce ? z : z - 50 }}
      transition={{ duration: reduce ? 0.2 : 0.8, delay: active ? delay : 0, ease: EASE }}
    >
      <div className={cn("absolute [transform-style:preserve-3d]", className)}>{children}</div>
    </motion.div>
  );
}

function Plate({ active, label }: { active: boolean; label: string }) {
  return (
    <Slab
      z={0}
      active={active}
      className="inset-[-12%] border border-white/10 bg-[linear-gradient(135deg,rgb(18_38_61/0.95),rgb(5_11_20/0.3))] shadow-[12px_12px_0_0_rgb(10_30_60/0.9)]"
    >
      <div className="blueprint-grid absolute inset-0 opacity-60" />
      <span className="absolute bottom-2 left-3 font-mono text-[10px] tracking-[0.18em] text-white/55">
        {label}
      </span>
    </Slab>
  );
}

const iso = "iso-stage relative mx-auto aspect-square w-full max-w-[520px] select-none";
const plane = "iso-plane absolute top-1/2 left-1/2 size-[58%] -translate-x-1/2 -translate-y-1/2";

/** 1 — Profile: three stacked onboarding cards. */
export function ProfileScene({ active }: { active: boolean }) {
  const cards = [
    {
      z: 30,
      pos: "inset-[2%_34%_46%_2%]",
      label: "TARGET ROLE",
      value: "Backend engineer",
      tone: "bg-white text-[#0b0f14]",
    },
    {
      z: 80,
      pos: "inset-[26%_18%_24%_20%]",
      label: "INTERVIEW",
      value: "in 12 days",
      tone: "bg-[#dcebff] text-[#0b0f14]",
    },
    {
      z: 130,
      pos: "inset-[50%_2%_2%_38%]",
      label: "LEARNS BEST",
      value: "Examples first",
      tone: "bg-[#97f0e5] text-[#0b0f14]",
    },
  ];
  return (
    <div aria-hidden className={iso}>
      <div className={plane}>
        <Plate active={active} label="YOUR PROFILE" />
        {cards.map((c, i) => (
          <Slab
            key={c.label}
            z={c.z}
            delay={0.15 + i * 0.15}
            active={active}
            className={cn(c.pos, "p-3 shadow-[10px_10px_0_0_rgb(29_78_216/0.55)]", c.tone)}
          >
            <p className="font-mono text-[9px] tracking-[0.2em] opacity-60">{c.label}</p>
            <p className="mt-1 max-w-[58%] text-sm leading-tight font-semibold tracking-tight">
              {c.value}
            </p>
          </Slab>
        ))}
      </div>
    </div>
  );
}

/** 2 — Practice: a question slab and a rubric scorecard with filling bars. */
export function PracticeScene({ active }: { active: boolean }) {
  const reduce = usePrefersReducedMotion();
  const bars = [
    { label: "Structure", w: 90 },
    { label: "Specific", w: 80 },
    { label: "Comms", w: 70 },
    { label: "Impact", w: 25 },
  ];
  return (
    <div aria-hidden className={iso}>
      <div className={plane}>
        <Plate active={active} label="MOCK INTERVIEW" />
        <Slab
          z={50}
          delay={0.15}
          active={active}
          className="inset-[4%_30%_48%_4%] border border-white/25 bg-[#12263d] p-3 shadow-[8px_8px_0_0_#0a1a2e]"
        >
          <p className="font-mono text-[9px] tracking-[0.2em] text-white/60">QUESTION 3 / 5</p>
          <div className="mt-2 h-1.5 w-[85%] bg-white/70" />
          <div className="mt-1.5 h-1.5 w-[60%] bg-white/40" />
        </Slab>
        <Slab
          z={120}
          delay={0.35}
          active={active}
          className="iso-face-glow inset-[40%_4%_4%_22%] bg-[#fbfaf6] p-3 text-[#0b0f14] shadow-[10px_10px_0_0_#1e3a8a]"
        >
          <p className="font-mono text-[9px] tracking-[0.2em] text-[#0b0f14]/60">RUBRIC</p>
          <ul className="mt-2 space-y-1.5">
            {bars.map((b, i) => (
              <li key={b.label} className="flex items-center gap-2">
                <span className="w-11 font-mono text-[8px]">{b.label}</span>
                <span className="h-1.5 flex-1 bg-[#0b0f14]/10">
                  <motion.span
                    className={cn("block h-full", b.w < 50 ? "bg-[#c4322b]" : "bg-[#0a5bc4]")}
                    initial={false}
                    animate={{ width: active ? `${b.w}%` : "0%" }}
                    transition={{
                      duration: reduce ? 0 : 0.7,
                      delay: active ? 0.6 + i * 0.1 : 0,
                      ease: EASE,
                    }}
                  />
                </span>
              </li>
            ))}
          </ul>
        </Slab>
      </div>
      <SceneChip className="right-[6%] bottom-[16%]" active={active} delay={1.1}>
        Fix: quantify the impact
      </SceneChip>
    </div>
  );
}

const TILES = [
  { x: 14, y: 16, tone: "bg-[#97f0e5]" },
  { x: 56, y: 12, tone: "bg-white/90" },
  { x: 26, y: 56, tone: "bg-white/90" },
  { x: 64, y: 58, tone: "bg-[#97f0e5]" },
];

/** 3 — Remember: notes drop onto the encrypted Walrus Memory slab above storage nodes. */
export function RememberScene({ active }: { active: boolean }) {
  const reduce = usePrefersReducedMotion();
  return (
    <div aria-hidden className={iso}>
      <div className={plane}>
        <Slab
          z={0}
          active={active}
          className="inset-[-12%] border border-white/10 bg-[linear-gradient(135deg,rgb(18_38_61/0.95),rgb(5_11_20/0.3))] shadow-[12px_12px_0_0_rgb(10_30_60/0.9)]"
        >
          {[12, 50, 88].flatMap((x) =>
            [14, 50, 86].map((y) => (
              <span
                key={`${x}-${y}`}
                className="absolute size-2"
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                <span className="absolute inset-0 rounded-full bg-[#7cbcff]" />
                <span
                  className="animate-pulse-ring absolute inset-0 rounded-full bg-[#7cbcff]/60"
                  style={{ animationDelay: `${(x + y) * 18}ms` }}
                />
              </span>
            )),
          )}
          <span className="absolute bottom-2 left-3 font-mono text-[10px] tracking-[0.18em] text-white/55">
            WALRUS · STORAGE NODES
          </span>
        </Slab>
        <Slab
          z={70}
          delay={0.2}
          active={active}
          className="iso-face-glow inset-[6%] bg-[linear-gradient(135deg,#7cbcff,#4da2ff_45%,#1d4ed8)] shadow-[12px_12px_0_0_#1e3a8a]"
        >
          <div className="blueprint-grid absolute inset-0 opacity-40" />
          {TILES.map((t, i) => (
            <motion.span
              key={`${t.x}-${t.y}`}
              className={cn("absolute size-[17%] shadow-[4px_4px_0_0_rgb(11_15_20/0.35)]", t.tone)}
              style={{ left: `${t.x}%`, top: `${t.y}%` }}
              initial={false}
              animate={active ? { opacity: 1, z: 6 } : { opacity: 0, z: reduce ? 6 : 140 }}
              transition={{
                duration: reduce ? 0.2 : 0.7,
                delay: active ? 0.7 + i * 0.18 : 0,
                ease: EASE,
              }}
            />
          ))}
          <span className="absolute bottom-2 left-3 font-mono text-[10px] tracking-[0.18em] text-[#0b0f14]/75">
            WALRUS MEMORY
          </span>
        </Slab>
      </div>
      <SceneChip className="top-[12%] right-[6%]" active={active} delay={1.3}>
        <Lock className="size-3" /> Seal-encrypted
      </SceneChip>
      <SceneChip className="bottom-[12%] left-[6%]" active={active} delay={1.5}>
        4 notes · 4 blob ids
      </SceneChip>
    </div>
  );
}

/** 4 — Adapt: memories lift from storage into the next session's recap. */
export function RecallScene({ active }: { active: boolean }) {
  const reduce = usePrefersReducedMotion();
  return (
    <div aria-hidden className={iso}>
      <div className={plane}>
        <Slab
          z={0}
          active={active}
          className="iso-face-glow inset-[0%] bg-[linear-gradient(135deg,#4da2ff,#1d4ed8)] shadow-[12px_12px_0_0_#1e3a8a]"
        >
          <div className="blueprint-grid absolute inset-0 opacity-40" />
          <span className="absolute bottom-2 left-3 font-mono text-[10px] tracking-[0.18em] text-white/80">
            WALRUS MEMORY
          </span>
        </Slab>
        {[
          { x: 18, y: 20 },
          { x: 58, y: 24 },
          { x: 36, y: 58 },
        ].map((t, i) => (
          <motion.div
            key={`${t.x}-${t.y}`}
            className="iso-layer"
            initial={false}
            animate={
              active ? { opacity: [0, 1, 1, 0], z: [4, 60, 120, 150] } : { opacity: 0, z: 4 }
            }
            transition={
              reduce
                ? { duration: 0 }
                : {
                    duration: 1.6,
                    delay: active ? 0.3 + i * 0.25 : 0,
                    ease: "easeOut",
                    times: [0, 0.2, 0.8, 1],
                  }
            }
          >
            <span
              className="absolute size-[15%] bg-[#97f0e5]"
              style={{ left: `${t.x}%`, top: `${t.y}%` }}
            />
          </motion.div>
        ))}
        <Slab
          z={170}
          delay={0.4}
          active={active}
          className="inset-[8%] border border-white/80 bg-[#050b14]/60 p-3 backdrop-blur-[2px]"
        >
          <p className="font-mono text-[9px] tracking-[0.2em] text-white/70">NEXT SESSION</p>
          <svg
            aria-hidden="true"
            viewBox="0 0 100 60"
            className="mt-2 h-[55%] w-full"
            preserveAspectRatio="none"
          >
            <motion.path
              d="M2 52 C 18 48, 28 34, 42 36 S 64 18, 76 16 S 92 8, 98 4"
              fill="none"
              stroke="#97f0e5"
              strokeWidth="1.6"
              initial={false}
              animate={{ pathLength: active ? 1 : 0 }}
              transition={{ duration: reduce ? 0 : 1.2, delay: active ? 1 : 0, ease: EASE }}
            />
          </svg>
        </Slab>
      </div>
      <SceneChip className="top-[14%] right-[4%]" active={active} delay={1.6}>
        <Check className="size-3 text-[#97f0e5]" /> Improvement logged
      </SceneChip>
      <SceneChip className="bottom-[14%] left-[4%]" active={active} delay={1.2}>
        Recalled 3 memories
      </SceneChip>
    </div>
  );
}

function SceneChip({
  className,
  active,
  delay,
  children,
}: {
  className: string;
  active: boolean;
  delay: number;
  children: React.ReactNode;
}) {
  const reduce = usePrefersReducedMotion();
  return (
    <motion.span
      className={cn(
        "absolute inline-flex items-center gap-1.5 border border-white/15 bg-[#050b14]/75 px-2.5 py-1.5 font-mono text-[11px] text-white/85 backdrop-blur-sm",
        className,
      )}
      initial={false}
      animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: reduce ? 0 : 8 }}
      transition={{ duration: reduce ? 0.1 : 0.45, delay: active ? (reduce ? 0 : delay) : 0 }}
    >
      {children}
    </motion.span>
  );
}
