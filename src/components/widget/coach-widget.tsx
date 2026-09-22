"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { useMediaQuery } from "@/hooks/use-media-query";
import { ApiError, api } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { safeSession } from "@/lib/browser-storage";
import type { MeDto } from "@/types/api";
import type { CoachUIMessage } from "@/types/chat";
import { COACHING_MODES, type CoachingMode } from "@/types/domain";
import { ChatView } from "./chat-view";
import { HomeView } from "./home-view";
import { Launcher } from "./launcher";
import { MemoryInspector } from "./memory-inspector";
import { OnboardingFlow } from "./onboarding/onboarding-flow";
import { PanelFrame, PanelHeader } from "./panel";
import { SessionSummary } from "./session-summary";
import { SignInCard } from "./sign-in-card";
import { initialWidgetState, widgetReducer } from "./state";
import { OPEN_WIDGET_EVENT } from "./widget-events";

const OPEN_KEY = "recall:widget:open";
const LAST_SESSION_KEY = "recall:widget:last";

interface LastSession {
  sessionId: string;
  mode: CoachingMode;
  memoryEnabled: boolean;
  title: string;
}

function readLastSession(): LastSession | null {
  const raw = safeSession.get(LAST_SESSION_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<LastSession>;
    return typeof v.sessionId === "string" && COACHING_MODES.some((m) => m === v.mode) && v.mode
      ? {
          sessionId: v.sessionId,
          mode: v.mode,
          memoryEnabled: v.memoryEnabled !== false,
          title: v.title ?? "Session",
        }
      : null;
  } catch {
    return null;
  }
}

export function CoachWidget({ variant = "floating" }: { variant?: "floating" | "page" }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const isMobile = useMediaQuery("(max-width: 639px)");
  const [state, dispatch] = useReducer(widgetReducer, variant === "page", initialWidgetState);
  const [me, setMe] = useState<MeDto | null>(null);
  const [starting, setStarting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const endedMessages = useRef<CoachUIMessage[]>([]);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const panelId = useId();
  const titleId = useId();
  const loadedOnce = useRef(false);
  const open = variant === "page" || state.open;

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const profile = await api.me();
      setMe(profile);
      dispatch({ type: "signedIn", onboarded: profile.onboarded });
      const last = readLastSession();
      if (profile.onboarded && last) {
        try {
          const s = await api.session(last.sessionId);
          if (!s.endedAt) dispatch({ type: "startChat", ...last });
          else safeSession.remove(LAST_SESSION_KEY);
        } catch {
          safeSession.remove(LAST_SESSION_KEY);
        }
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setMe(null);
        dispatch({ type: "signedOut" });
      } else {
        setLoadError(
          e instanceof ApiError && e.status === 503
            ? "The coach is reconnecting. Please retry in a moment."
            : "Couldn't reach the coach. Check your connection.",
        );
      }
    }
  }, []);

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

  // Load identity once, the first time the panel opens (or immediately on /coach).
  useEffect(() => {
    if (open && !loadedOnce.current) {
      loadedOnce.current = true;
      void load();
    }
  }, [open, load]);

  // Launcher recap dot needs identity even while closed (cheap, cached by browser).
  useEffect(() => {
    if (variant !== "floating") return;
    api
      .me()
      .then(setMe)
      .catch(() => {});
  }, [variant]);

  useEffect(() => {
    if (variant === "floating") safeSession.set(OPEN_KEY, state.open ? "1" : "0");
  }, [state.open, variant]);

  // Focus into the panel on open; back to the launcher on close.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (variant !== "floating") return;
    if (open && !wasOpen.current) window.requestAnimationFrame(() => titleRef.current?.focus());
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
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_WIDGET_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_WIDGET_EVENT, onOpen);
    };
  }, [variant, state.open, state.inspectorOpen, isMobile]);

  async function startSession(mode: CoachingMode, memoryEnabled: boolean) {
    setStarting(true);
    try {
      const s = await api.createSession({ mode, memoryEnabled });
      const last: LastSession = {
        sessionId: s.id,
        mode: s.mode,
        memoryEnabled: s.memoryEnabled,
        title: s.title,
      };
      safeSession.set(LAST_SESSION_KEY, JSON.stringify(last));
      dispatch({ type: "startChat", ...last });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't start a session. Please retry.");
    } finally {
      setStarting(false);
    }
  }

  async function endSession(sessionId: string, messages: CoachUIMessage[]) {
    endedMessages.current = messages;
    try {
      await api.patchSession(sessionId, { action: "end" });
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) {
        toast.error("Couldn't end the session. Please retry.");
        return;
      }
    }
    safeSession.remove(LAST_SESSION_KEY);
    dispatch({ type: "endChat" });
  }

  async function signOut() {
    await authClient.signOut();
    safeSession.remove(LAST_SESSION_KEY);
    setMe(null);
    dispatch({ type: "signedOut" });
  }

  const view = state.view;
  const memoryState =
    view.name === "chat" || view.name === "summary" ? (view.memoryEnabled ? "on" : "off") : null;
  const callbackPath = variant === "page" ? "/coach" : "/?coach=open";

  const body = (
    <PanelFrame>
      <PanelHeader
        titleId={titleId}
        titleRef={titleRef}
        memoryState={memoryState}
        variant={variant}
        signedIn={Boolean(me) && view.name !== "signedOut"}
        onExpand={() => router.push("/coach")}
        onClose={() => dispatch({ type: "close" })}
        onOpenInspector={() => dispatch({ type: "inspector", open: true })}
        onSignOut={() => void signOut()}
      />
      {loadError ? (
        <div role="alert" className="flex flex-1 flex-col items-start gap-3 p-5 text-sm">
          <p>{loadError}</p>
          <Button variant="outline" onClick={() => void load()}>
            Reconnect
          </Button>
        </div>
      ) : view.name === "loading" ? (
        <div role="status" className="space-y-3 p-5" aria-busy="true" aria-label="Loading coach">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : view.name === "signedOut" ? (
        <SignInCard callbackPath={callbackPath} />
      ) : view.name === "onboarding" ? (
        <OnboardingFlow
          step={view.step}
          onStep={(step) => dispatch({ type: "onboardingStep", step })}
          onDone={() => {
            setMe((m) => (m ? { ...m, onboarded: true, memoryConsent: true } : m));
            dispatch({ type: "onboarded" });
          }}
        />
      ) : view.name === "home" && me ? (
        <HomeView
          me={me}
          starting={starting}
          onStart={(mode, memoryEnabled) => void startSession(mode, memoryEnabled)}
          onOpenInspector={() => dispatch({ type: "inspector", open: true })}
        />
      ) : view.name === "chat" ? (
        <ChatView
          key={view.sessionId}
          sessionId={view.sessionId}
          mode={view.mode}
          memoryEnabled={view.memoryEnabled}
          title={view.title}
          onEnd={(messages) => void endSession(view.sessionId, messages)}
          onOpenInspector={() => dispatch({ type: "inspector", open: true })}
        />
      ) : view.name === "summary" ? (
        <SessionSummary
          sessionId={view.sessionId}
          title={view.title}
          memoryEnabled={view.memoryEnabled}
          messages={endedMessages.current}
          onHome={() => dispatch({ type: "home" })}
          onOpenInspector={() => dispatch({ type: "inspector", open: true })}
        />
      ) : null}
      <MemoryInspector
        open={state.inspectorOpen}
        onOpenChange={(o) => dispatch({ type: "inspector", open: o })}
      />
    </PanelFrame>
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
      />
      {isMobile ? (
        <Drawer open={state.open} onOpenChange={(o) => dispatch({ type: o ? "open" : "close" })}>
          <DrawerContent id={panelId} className="h-[92dvh] max-h-[92dvh]">
            <DrawerTitle className="sr-only">Interview coach</DrawerTitle>
            <DrawerDescription className="sr-only">
              Practice interviews with a coach that remembers your past sessions.
            </DrawerDescription>
            {body}
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
              className="fixed right-4 bottom-[5.5rem] z-50 h-[680px] max-h-[calc(100dvh-6.5rem)] w-[420px] max-w-[calc(100vw-2rem)] overflow-hidden border border-border shadow-[0_24px_60px_-24px_rgb(11_15_20/0.45)]"
            >
              {body}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </>
  );
}
