"use client";

import { type RefObject, useEffect, useState } from "react";

/** Live width of an element (ResizeObserver); `fallback` until measured. */
export function useElementWidth(ref: RefObject<HTMLElement | null>, fallback = 0): number {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w !== undefined) setWidth(Math.round(w));
    });
    observer.observe(el);
    setWidth(Math.round(el.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
