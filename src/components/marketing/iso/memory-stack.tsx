"use client";

import { motion } from "motion/react";
import { usePrefersReducedMotion } from "@/hooks/use-media-query";

/**
 * Hero model: the memory path as stacked isometric layers.
 *   Walrus (storage nodes)  →  Walrus Memory (encrypted notes)  →  Callback (recap)
 * Pure CSS 3D + motion; decorative (aria-hidden) with a text caption outside.
 */
const TILES = [
  { x: 18, y: 22, delay: 1.1, tone: "memory" },
  { x: 58, y: 18, delay: 1.35, tone: "primary" },
  { x: 30, y: 58, delay: 1.6, tone: "primary" },
  { x: 66, y: 60, delay: 1.85, tone: "memory" },
] as const;

const NODES = [
  [12, 14],
  [50, 10],
  [86, 16],
  [20, 50],
  [52, 46],
  [84, 52],
  [14, 86],
  [48, 84],
  [88, 88],
] as const;

export function MemoryStack() {
  const reduce = usePrefersReducedMotion();
  const rise = (z: number, delay: number) =>
    reduce
      ? {
          initial: { opacity: 0 },
          animate: { opacity: 1, z },
          transition: { duration: 0.4, delay: delay * 0.3 },
        }
      : {
          initial: { opacity: 0, z: z - 60 },
          animate: { opacity: 1, z },
          transition: { duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] as const },
        };

  return (
    <div
      aria-hidden
      className="iso-stage relative mx-auto aspect-square w-full max-w-[560px] select-none"
    >
      <div className="iso-plane absolute top-1/2 left-1/2 size-[62%] -translate-x-1/2 -translate-y-1/2">
        {/* Layer 1 — Walrus: storage nodes on a dim base plate */}
        <motion.div className="iso-layer" {...rise(0, 0.15)}>
          <div className="absolute inset-[-14%] border border-white/10 bg-[linear-gradient(135deg,rgb(18_38_61/0.9),rgb(5_11_20/0.2))] shadow-[14px_14px_0_0_rgb(10_30_60/0.9)]">
            {NODES.map(([x, y]) => (
              <span
                key={`${x}-${y}`}
                className="absolute size-2"
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                <span className="absolute inset-0 rounded-full bg-[#7cbcff]" />
                <span
                  className="animate-pulse-ring absolute inset-0 rounded-full bg-[#7cbcff]/60"
                  style={{ animationDelay: `${(x + y) * 20}ms` }}
                />
              </span>
            ))}
            <span className="absolute bottom-2 left-3 font-mono text-[10px] tracking-[0.18em] text-white/55">
              WALRUS · STORAGE NODES
            </span>
          </div>
        </motion.div>

        {/* Layer 2 — Walrus Memory: the glowing encrypted-notes slab */}
        <motion.div className="iso-layer" {...rise(70, 0.45)}>
          <div className="iso-face-glow absolute inset-[6%] [transform-style:preserve-3d] bg-[linear-gradient(135deg,#7cbcff,#4da2ff_45%,#1d4ed8)] shadow-[12px_12px_0_0_#1e3a8a]">
            <div className="blueprint-grid absolute inset-0 opacity-40 [--foreground:#fff]" />
            {TILES.map((t) => (
              <motion.span
                key={`${t.x}-${t.y}`}
                className={`absolute size-[16%] ${t.tone === "memory" ? "bg-[#97f0e5]" : "bg-white/90"} shadow-[4px_4px_0_0_rgb(11_15_20/0.35)]`}
                style={{ left: `${t.x}%`, top: `${t.y}%` }}
                initial={reduce ? { opacity: 0 } : { opacity: 0, z: 90 }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, z: 6 }}
                transition={{
                  delay: reduce ? 0.3 : t.delay,
                  duration: 0.7,
                  ease: [0.16, 1, 0.3, 1],
                }}
              />
            ))}
            <span className="absolute bottom-2 left-3 font-mono text-[10px] tracking-[0.18em] text-[#0b0f14]/75">
              WALRUS MEMORY · SEAL-ENCRYPTED
            </span>
          </div>
        </motion.div>

        {/* Layer 3 — Callback: wireframe recap frame with a progress trace */}
        <motion.div className="iso-layer" {...rise(170, 0.8)}>
          <div className="absolute inset-[16%] border border-white/70">
            <svg
              aria-hidden="true"
              viewBox="0 0 100 100"
              className="absolute inset-0 size-full"
              preserveAspectRatio="none"
            >
              <path
                d="M6 78 C 22 70, 30 40, 44 48 S 66 30, 76 26 S 90 18, 95 12"
                fill="none"
                stroke="rgb(255 255 255 / 0.85)"
                strokeWidth="0.8"
                className="animate-dash"
              />
            </svg>
            <span className="absolute top-2 left-3 font-mono text-[10px] tracking-[0.18em] text-white/80">
              CALLBACK · PROGRESS
            </span>
            <span className="absolute right-0 bottom-0 size-1.5 translate-x-1/2 translate-y-1/2 bg-white" />
            <span className="absolute top-0 left-0 size-1.5 -translate-x-1/2 -translate-y-1/2 bg-white" />
          </div>
        </motion.div>
      </div>

      {/* Floating callouts (flat, positioned around the model) */}
      <Callout className="top-[14%] right-[4%]" delay={1.9}>
        <span className="text-[#97f0e5]">●</span> Improvement logged
      </Callout>
      <Callout className="bottom-[20%] left-[2%]" delay={2.1}>
        Mistake · skipped the Result
      </Callout>
      <Callout className="bottom-[8%] right-[10%]" delay={2.3}>
        Recalled 3 memories
      </Callout>
    </div>
  );
}

function Callout({
  children,
  className,
  delay,
}: {
  children: React.ReactNode;
  className: string;
  delay: number;
}) {
  const reduce = usePrefersReducedMotion();
  return (
    <motion.span
      className={`absolute border border-white/15 bg-[#050b14]/70 px-2.5 py-1.5 font-mono text-[11px] text-white/85 backdrop-blur-sm ${className}`}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduce ? 0.2 : delay, duration: 0.5 }}
    >
      {children}
    </motion.span>
  );
}
