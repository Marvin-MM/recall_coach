"use client";

import { MessageSquareText, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { forwardRef } from "react";

interface LauncherProps {
  open: boolean;
  controlsId: string;
  hasRecap: boolean;
  onToggle: () => void;
}

/** 56px Sui-blue launcher, ink icon + ink hairline (≥3:1 boundary on paper). */
export const Launcher = forwardRef<HTMLButtonElement, LauncherProps>(function Launcher(
  { open, controlsId, hasRecap, onToggle },
  ref,
) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      ref={ref}
      type="button"
      onClick={onToggle}
      aria-label={open ? "Close interview coach" : "Open interview coach"}
      aria-expanded={open}
      aria-controls={controlsId}
      aria-keyshortcuts="Control+K Meta+K"
      initial={reduce ? false : { scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileTap={reduce ? {} : { scale: 0.94 }}
      transition={{ type: "spring", stiffness: 380, damping: 22, delay: reduce ? 0 : 0.4 }}
      className="fixed right-4 bottom-4 z-50 flex size-14 items-center justify-center rounded-full border border-ink bg-primary text-ink shadow-[0_6px_20px_-6px_rgb(10_91_196/0.55)]"
    >
      {open ? (
        <X className="size-6" aria-hidden />
      ) : (
        <MessageSquareText className="size-6" aria-hidden />
      )}
      {hasRecap && !open && (
        <span
          className="absolute top-1 right-1 size-3 rounded-full border-2 border-primary bg-memory"
          aria-hidden
        />
      )}
      {hasRecap && !open && <span className="sr-only">(recap available)</span>}
    </motion.button>
  );
});
