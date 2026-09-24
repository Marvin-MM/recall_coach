"use client";

/** Decoupled "open the coach" signal so marketing CTAs don't import the widget. */
export const OPEN_WIDGET_EVENT = "recall:open-widget";

export function openCoachWidget(): void {
  window.dispatchEvent(new CustomEvent(OPEN_WIDGET_EVENT));
}

export const PREFETCH_WIDGET_EVENT = "recall:prefetch-widget";

/** Ask the widget to prefetch its panel chunk (hover/focus on a CTA). */
export function prefetchCoachWidget(): void {
  window.dispatchEvent(new CustomEvent(PREFETCH_WIDGET_EVENT));
}

/** sessionStorage key: where to land after Google sign-in (e.g. /admin/evidence), set from `?next=`. */
export const NEXT_KEY = "recall:signin:next";
