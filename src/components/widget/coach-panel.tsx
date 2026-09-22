"use client";

import { useRouter } from "next/navigation";
import { type Dispatch, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, api } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { safeSession } from "@/lib/browser-storage";
import type { MeDto } from "@/types/api";
import type { CoachUIMessage } from "@/types/chat";
import { COACHING_MODES, type CoachingMode } from "@/types/domain";
import { ChatView } from "./chat-view";
import { HomeView } from "./home-view";
import { MemoryInspector } from "./memory-inspector";
import { OnboardingFlow } from "./onboarding/onboarding-flow";
import { PanelFrame, PanelHeader } from "./panel";
import { SessionSummary } from "./session-summary";
import { SignInCard } from "./sign-in-card";
import type { WidgetAction, WidgetState } from "./state";

export const LAST_SESSION_KEY = "recall:widget:last";

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

export function PanelLoading() {
  return (
    <div role="status" className="space-y-3 p-5" aria-busy="true" aria-label="Loading coach">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

export interface CoachPanelBodyProps {
  state: WidgetState;
  dispatch: Dispatch<WidgetAction>;
  variant: "floating" | "page";
  titleId: string;
  titleRef: RefObject<HTMLHeadingElement | null>;
  onIdentity: (me: MeDto | null) => void;
}

/**
 * Everything inside the coach panel. Loaded lazily (next/dynamic) so the
 * landing page ships only the launcher until the coach is opened.
 */
export function CoachPanelBody({
  state,
  dispatch,
  variant,
  titleId,
  titleRef,
  onIdentity,
}: CoachPanelBodyProps) {
  const router = useRouter();
  const [me, setMe] = useState<MeDto | null>(null);
  const [starting, setStarting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const endedMessages = useRef<CoachUIMessage[]>([]);

  const identify = useCallback(
    (value: MeDto | null) => {
      setMe(value);
      onIdentity(value);
    },
    [onIdentity],
  );

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await api.me();
      if (!res.signedIn) {
        identify(null);
        dispatch({ type: "signedOut" });
        return;
      }
      identify(res);
      dispatch({ type: "signedIn", onboarded: res.onboarded });
      const last = readLastSession();
      if (res.onboarded && last) {
        try {
          const s = await api.session(last.sessionId);
          if (!s.endedAt) dispatch({ type: "startChat", ...last });
          else safeSession.remove(LAST_SESSION_KEY);
        } catch {
          safeSession.remove(LAST_SESSION_KEY);
        }
      }
    } catch (e) {
      setLoadError(
        e instanceof ApiError && e.status === 503
          ? "The coach is reconnecting. Please retry in a moment."
          : "Couldn't reach the coach. Check your connection.",
      );
    }
  }, [dispatch, identify]);

  useEffect(() => {
    void load();
  }, [load]);

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
    identify(null);
    dispatch({ type: "signedOut" });
  }

  const view = state.view;
  const memoryState =
    view.name === "chat" || view.name === "summary" ? (view.memoryEnabled ? "on" : "off") : null;
  const callbackPath = variant === "page" ? "/coach" : "/?coach=open";
  const openInspector = () => dispatch({ type: "inspector", open: true });

  return (
    <PanelFrame>
      <PanelHeader
        titleId={titleId}
        titleRef={titleRef}
        memoryState={memoryState}
        variant={variant}
        signedIn={Boolean(me) && view.name !== "signedOut"}
        onExpand={() => router.push("/coach")}
        onClose={() => dispatch({ type: "close" })}
        onOpenInspector={openInspector}
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
        <PanelLoading />
      ) : view.name === "signedOut" ? (
        <SignInCard callbackPath={callbackPath} />
      ) : view.name === "onboarding" ? (
        <OnboardingFlow
          step={view.step}
          onStep={(step) => dispatch({ type: "onboardingStep", step })}
          onDone={() => {
            if (me) identify({ ...me, onboarded: true, memoryConsent: true });
            dispatch({ type: "onboarded" });
          }}
        />
      ) : view.name === "home" && me ? (
        <HomeView
          me={me}
          starting={starting}
          onStart={(mode, memoryEnabled) => void startSession(mode, memoryEnabled)}
          onOpenInspector={openInspector}
        />
      ) : view.name === "chat" ? (
        <ChatView
          key={view.sessionId}
          sessionId={view.sessionId}
          mode={view.mode}
          memoryEnabled={view.memoryEnabled}
          title={view.title}
          onEnd={(messages) => void endSession(view.sessionId, messages)}
          onOpenInspector={openInspector}
        />
      ) : view.name === "summary" ? (
        <SessionSummary
          sessionId={view.sessionId}
          title={view.title}
          memoryEnabled={view.memoryEnabled}
          messages={endedMessages.current}
          onHome={() => dispatch({ type: "home" })}
          onOpenInspector={openInspector}
        />
      ) : (
        <PanelLoading />
      )}
      <MemoryInspector
        open={state.inspectorOpen}
        onOpenChange={(o) => dispatch({ type: "inspector", open: o })}
      />
    </PanelFrame>
  );
}
