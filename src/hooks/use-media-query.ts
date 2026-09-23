"use client";

import { useSyncExternalStore } from "react";

export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

/**
 * Hydration-safe reduced-motion preference: `false` during SSR and hydration
 * (matching the server HTML), then the real value. Prefer this over motion's
 * `useReducedMotion`, which reads the preference on the first client render
 * and causes attribute mismatches in server-rendered components.
 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
