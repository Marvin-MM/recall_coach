"use client";

import {
  ArrowUpRight,
  Boxes,
  Database,
  FileLock2,
  KeyRound,
  Laptop,
  Network,
  Server,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePrefersReducedMotion } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { LiveStatus } from "./live-status";

const PIPELINE = [
  {
    icon: Laptop,
    name: "You",
    detail: "Signed in with Google. Your transcript is saved encrypted, for you only.",
  },
  {
    icon: Server,
    name: "Callback server",
    detail: "Derives your private namespace and holds the delegate key.",
  },
  { icon: Database, name: "Walrus Memory", detail: "Embeds each note and encrypts it with Seal." },
  { icon: Boxes, name: "Walrus", detail: "Stores the encrypted blob across storage nodes." },
  { icon: Network, name: "Sui", detail: "Owns the memory account and its access policy." },
];

const GUARANTEES = [
  {
    icon: KeyRound,
    title: "Encrypted with Seal",
    body: "Notes are encrypted before they reach Walrus. Only this coach's delegate key can decrypt them.",
  },
  {
    icon: FileLock2,
    title: "Your namespace, derived server-side",
    body: "The namespace comes from your account on our server — no one can ask for someone else's memories by changing a request.",
  },
  {
    icon: Server,
    title: "Transcripts are for you",
    body: "Your history is encrypted (AES-256-GCM) and readable by you. The coach sees only the current session's messages; across sessions it uses memories only. Turn history off any time.",
  },
];

export function Trust({ accountUrl }: { accountUrl: string }) {
  const reduce = usePrefersReducedMotion();
  return (
    <section
      id="privacy-and-trust"
      aria-labelledby="privacy-and-trust-title"
      data-band="deep"
      className="deep relative isolate scroll-mt-20 overflow-hidden"
    >
      <div
        aria-hidden
        className="blueprint-grid absolute inset-0 -z-10 opacity-60 [mask-image:radial-gradient(90%_80%_at_50%_0%,black,transparent)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(70%_55%_at_50%_115%,rgb(29_78_216/0.55),transparent_70%)]"
      />
      <div className="mx-auto max-w-6xl space-y-14 px-4 py-20 sm:px-6 sm:py-24">
        <div className="max-w-2xl space-y-3">
          <p className="font-mono text-[11px] tracking-[0.18em] text-link uppercase">
            Privacy & trust
          </p>
          <h2
            id="privacy-and-trust-title"
            className="text-3xl font-semibold tracking-[-0.025em] text-balance sm:text-4xl"
          >
            Where your memories live
          </h2>
          <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
            Every note takes the same path — from your session to encrypted storage on{" "}
            <span className="text-foreground">Walrus Mainnet</span>, secured by the Sui network.
          </p>
        </div>

        {/* Architecture pipeline */}
        <ol aria-label="How a memory is stored" className="grid gap-0 lg:grid-cols-5">
          {PIPELINE.map(({ icon: Icon, name, detail }, i) => (
            <motion.li
              key={name}
              className="relative flex gap-4 pb-8 lg:flex-col lg:gap-4 lg:pr-6 lg:pb-0"
              initial={reduce ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.5, delay: reduce ? 0 : i * 0.12, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* Connector to the next node */}
              {i < PIPELINE.length - 1 && (
                <>
                  <span
                    aria-hidden
                    className="flow-y absolute top-12 bottom-0 left-6 w-px lg:hidden"
                  />
                  <span
                    aria-hidden
                    className="flow-x absolute top-6 right-0 left-12 hidden h-px lg:block"
                  />
                </>
              )}
              <span
                className={cn(
                  "relative z-10 flex size-12 shrink-0 items-center justify-center border",
                  i === 2
                    ? "border-[#7cbcff] bg-[linear-gradient(135deg,#7cbcff,#1d4ed8)] text-white shadow-[0_0_40px_-6px_rgb(77_162_255/0.8)]"
                    : "border-white/15 bg-card text-link",
                )}
              >
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block font-mono text-[10px] tracking-[0.16em] text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="block font-medium">{name}</span>
                <span className="mt-1 block max-w-[34ch] text-sm leading-relaxed text-muted-foreground">
                  {detail}
                </span>
              </span>
            </motion.li>
          ))}
        </ol>

        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_1.1fr]">
          {GUARANTEES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="border border-white/10 bg-card/70 p-5 backdrop-blur-sm">
              <Icon className="size-5 text-link" aria-hidden />
              <h3 className="mt-4 font-medium">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
          <div className="flex flex-col gap-4 border border-white/10 bg-card/70 p-5 backdrop-blur-sm">
            <h3 className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
              Live status
            </h3>
            <LiveStatus />
            <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <a
                href={accountUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-link hover:underline"
              >
                Memory account on Sui <ArrowUpRight className="size-3.5" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
              <a href="/api/health" className="text-link hover:underline">
                Raw health check
              </a>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-l-2 border-warning-foreground/70 bg-warning px-4 py-3 text-sm text-warning-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            Callback doesn't have a delete button yet. Walrus Memory can permanently delete stored
            memories, so this is a gap in Callback, not a limit of the storage.
          </p>
          <Link href="/privacy" className="shrink-0 font-medium underline">
            Read the privacy details
          </Link>
        </div>
      </div>
    </section>
  );
}
