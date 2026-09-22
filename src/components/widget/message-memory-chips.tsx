"use client";

import { ChevronDown, CloudOff, History } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, useState } from "react";
import type { MemoryDataPart } from "@/types/chat";
import { BlobId } from "./blob-id";
import { formatWhen, KIND_META } from "./kind-meta";

/**
 * "Citations" for memory: which Walrus memories the coach saw before writing
 * this reply. Collapsed by default; expands into margin notes.
 */
export function MessageMemoryChips({ part }: { part: MemoryDataPart }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const reduce = useReducedMotion();

  if (part.amnesia) return null;

  if (part.degraded) {
    return (
      <p
        role="status"
        className="flex items-start gap-2 border-l-2 border-warning-foreground/60 bg-warning px-2.5 py-1.5 text-xs text-warning-foreground"
      >
        <CloudOff className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Memory temporarily unavailable — coaching continues without it.
      </p>
    );
  }

  const count = part.recalled.length;
  if (count === 0) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <History className="size-3.5" aria-hidden />
        No past notes matched this message.
      </p>
    );
  }

  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={listId}
        className="inline-flex min-h-6 items-center gap-1.5 border border-transparent bg-accent px-2 py-1 font-medium text-accent-foreground hover:border-ring/40"
      >
        <History className="size-3.5" aria-hidden />
        Recalled {count} {count === 1 ? "memory" : "memories"}
        <ChevronDown
          className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            id={listId}
            layout={!reduce}
            initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="mt-2 space-y-1.5 overflow-hidden"
          >
            {part.recalled.map((chip) => {
              const meta = KIND_META[chip.kind];
              const Icon = meta.icon;
              return (
                <li key={chip.blobId} className="border-l-2 border-link bg-card py-1.5 pr-2 pl-2.5">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Icon className="size-3.5 shrink-0 text-link" aria-hidden />
                    <span className="font-medium text-foreground">{meta.label}</span>
                    {chip.at && (
                      <span className="font-mono text-[11px]">{formatWhen(chip.at)}</span>
                    )}
                    <BlobId blobId={chip.blobId} className="ml-auto" />
                  </div>
                  <p className="mt-0.5 leading-snug text-foreground">{chip.snippet}</p>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
