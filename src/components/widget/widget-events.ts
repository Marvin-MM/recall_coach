"use client";

/** Decoupled "open the coach" signal so marketing CTAs don't import the widget. */
export const OPEN_WIDGET_EVENT = "recall:open-widget";

export function openCoachWidget(): void {
  window.dispatchEvent(new CustomEvent(OPEN_WIDGET_EVENT));
}
