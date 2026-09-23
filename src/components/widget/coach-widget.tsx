"use client";

import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useId, useReducer, useRef, useState } from "react";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { useMediaQuery, usePrefersReducedMotion } from "@/hooks/use-media-query";
import { safeSession } from "@/lib/browser-storage";
import type { MeDto } from "@/types/api";
import { Launcher } from "./launcher";
import { initialWidgetState, widgetReducer } from "./state";
import { OPEN_WIDGET_EVENT, PREFETCH_WIDGET_EVENT } from "./widget-events";

const OPEN_KEY = "recall:widget:open";

const loadPanel = () => import("./coach-panel");

// The panel (chat, AI SDK, markdown, sheets) is split out of the landing
// bundle; only the launcher ships up front.
const CoachPanelBody = dynamic(() => loadPanel().then((m) => m.CoachPanelBody), {
  ssr: false,
  loading: () => (
    <div role="status" className="space-y-3 p-5" aria-busy="true" aria-label="Loading coach">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-20 w-full" />
    </div>
  ),
});

export function CoachWidget({ variant = "floating" }: { variant?: "floating" | "page" }) {
  const reduce = usePrefersReducedMotion();
  const isMobile = useMediaQuery("(max-width: 639px)");
  const [state, dispatch] = useReducer(widgetReducer, variant === "page", initialWidgetState);
  const [me, setMe] = useState<MeDto | null>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const panelId = useId();
  const titleId = useId();
  const open = variant === "page" || state.open;
  const onIdentity = useCallback((value: MeDto | null) => setMe(value), []);

  // Restore open state; honour ?signin=1 (proxy redirect) and ?coach=open (OAuth return).
  useEffect(() => {
    if (variant !== "floating") return;
    const url = new URL(window.location.href);
    const wantsOpen =
      url.searchParams.has("signin") ||
      url.searchParams.get("coach") === "open" ||
      safeSession.get(OPEN_KEY) === "1";
    if (url.searchParams.has("signin") || url.searchParams.has("coach")) {
      url.searchParams.delete("signin");
      url.searchParams.delete("coach");
      url.searchParams.delete("next");
      window.history.replaceState(null, "", url.toString());
    }
    if (wantsOpen) dispatch({ type: "open" });
  }, [variant]);

  // Launcher recap dot: identity while closed (small JSON; 200 for visitors).
  useEffect(() => {
    if (variant !== "floating") return;
    let cancelled = false;
    fetch("/api/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<{ signedIn: boolean } & Partial<MeDto>>) : null))
      .then((res) => {
        if (!cancelled && res?.signedIn) setMe(res as MeDto);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [variant]);

  useEffect(() => {
    if (variant === "floating") safeSession.set(OPEN_KEY, state.open ? "1" : "0");
  }, [state.open, variant]);

  // Focus into the panel on open; back to the launcher on close.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (variant !== "floating") return;
    if (open && !wasOpen.current) {
      // The panel may still be loading: retry briefly until the title exists.
      let tries = 0;
      const focusTitle = () => {
        if (titleRef.current) titleRef.current.focus();
        else if (tries++ < 20) window.setTimeout(focusTitle, 50);
      };
      window.requestAnimationFrame(focusTitle);
    }
    if (!open && wasOpen.current) launcherRef.current?.focus();
    wasOpen.current = open;
  }, [open, variant]);

  // ⌘K / Ctrl+K toggles, Esc closes (floating only); external "open" events.
  useEffect(() => {
    if (variant !== "floating") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        dispatch({ type: "toggle" });
      } else if (e.key === "Escape" && state.open && !state.inspectorOpen && !isMobile) {
        // Esc inside an overlay (inspector sheet, menus) belongs to that overlay.
        const target = e.target instanceof Element ? e.target : null;
        const inOverlay = target?.closest(
          '[data-slot="sheet-content"],[data-slot="dropdown-menu-content"],[role="menu"],[role="listbox"]',
        );
        if (e.defaultPrevented || inOverlay) return;
        dispatch({ type: "close" });
      }
    };
    const onOpen = () => dispatch({ type: "open" });
    const onPrefetch = () => void loadPanel();
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_WIDGET_EVENT, onOpen);
    window.addEventListener(PREFETCH_WIDGET_EVENT, onPrefetch);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_WIDGET_EVENT, onOpen);
      window.removeEventListener(PREFETCH_WIDGET_EVENT, onPrefetch);
    };
  }, [variant, state.open, state.inspectorOpen, isMobile]);

  const body = (
    <CoachPanelBody
      state={state}
      dispatch={dispatch}
      variant={variant}
      titleId={titleId}
      titleRef={titleRef}
      onIdentity={onIdentity}
    />
  );

  if (variant === "page") {
    return (
      <section
        id={panelId}
        aria-labelledby={titleId}
        className="mx-auto flex h-[calc(100dvh-5rem)] w-full max-w-3xl flex-col border border-border"
      >
        {body}
      </section>
    );
  }

  return (
    <>
      <Launcher
        ref={launcherRef}
        open={state.open}
        controlsId={panelId}
        hasRecap={Boolean(me && me.doneMemories > 0)}
        onToggle={() => dispatch({ type: "toggle" })}
        onIntent={() => void loadPanel()}
      />
      {isMobile ? (
        <Drawer open={state.open} onOpenChange={(o) => dispatch({ type: o ? "open" : "close" })}>
          <DrawerContent id={panelId} className="h-[92dvh] max-h-[92dvh]">
            <DrawerTitle className="sr-only">Interview coach</DrawerTitle>
            <DrawerDescription className="sr-only">
              Practice interviews with a coach that remembers your past sessions.
            </DrawerDescription>
            {state.open && body}
          </DrawerContent>
        </Drawer>
      ) : (
        <AnimatePresence>
          {state.open && (
            <motion.div
              id={panelId}
              role="dialog"
              aria-modal="false"
              aria-labelledby={titleId}
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
              style={{ transformOrigin: "bottom right" }}
              className="fixed right-4 bottom-[5.5rem] z-50 flex h-[680px] max-h-[calc(100dvh-6.5rem)] w-[420px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden border border-border bg-background shadow-[0_24px_60px_-24px_rgb(11_15_20/0.45)]"
            >
              {body}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </>
  );
}
