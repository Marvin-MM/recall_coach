"use client";

import { useRouter } from "next/navigation";
import { type Dispatch, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, api } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import type { MeDto, SessionDto } from "@/types/api";
import type { CoachUIMessage } from "@/types/chat";
import type { CoachingMode } from "@/types/domain";
import { ChatView } from "./chat-view";
import { HistorySettings } from "./history-settings";
import { HomeView } from "./home-view";
import { MemoryInspector } from "./memory-inspector";
import { OnboardingFlow } from "./onboarding/onboarding-flow";
import { PanelFrame, PanelHeader } from "./panel";
import { SessionDetail } from "./session-detail";
import { SessionSummary } from "./session-summary";
import { SignInCard } from "./sign-in-card";
import type { RecapSeed, WidgetAction, WidgetState } from "./state";

const seedOf = (s: Pick<SessionDto, "id" | "mode" | "memoryEnabled" | "title">) => ({
  sessionId: s.id,
  mode: s.mode,
  memoryEnabled: s.memoryEnabled,
  title: s.title,
});

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
  const [chatKey, setChatKey] = useState(0);
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
      // Reopen an unfinished session (≤ 2 h idle) with its transcript — only
      // when history is on; otherwise nothing is restored and home is shown.
      if (res.onboarded && res.saveTranscripts) {
        try {
          const { session } = await api.activeSession();
          if (session) {
            dispatch({ type: "startChat", ...seedOf(session), restore: true });
            return;
          }
        } catch {
          // fall through to home
        }
      }
      dispatch({ type: "signedIn", onboarded: res.onboarded });
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

  async function startSession(mode: CoachingMode, memoryEnabled: boolean, recap?: RecapSeed) {
    setStarting(true);
    try {
      const s = await api.createSession({ mode, memoryEnabled });
      dispatch({ type: "startChat", ...seedOf(s), ...(recap ? { recap } : {}) });
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
    dispatch({ type: "endChat" });
  }

  /** History setting changed elsewhere: refresh settings, then reopen the chat with the right mode. */
  const reloadChat = useCallback(async () => {
    try {
      const res = await api.me();
      if (res.signedIn) identify(res);
    } finally {
      setChatKey((k) => k + 1);
    }
  }, [identify]);

  async function signOut() {
    await authClient.signOut();
    identify(null);
    dispatch({ type: "signedOut" });
  }

  const view = state.view;
  const memoryState =
    view.name === "chat" || view.name === "summary" ? (view.memoryEnabled ? "on" : "off") : null;
  const callbackPath = variant === "page" ? "/coach" : "/?coach=open";
  const openInspector = () => dispatch({ type: "inspector", open: true });
  const saveTranscripts = me?.saveTranscripts ?? true;

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
        onOpenSettings={() => dispatch({ type: "settings", open: true })}
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
          tab={view.tab}
          onTabChange={(tab) => dispatch({ type: "home", tab })}
          onStart={(mode, memoryEnabled) => void startSession(mode, memoryEnabled)}
          onOpenInspector={openInspector}
          onOpenSession={(s) =>
            dispatch({
              type: "openDetail",
              session: { ...seedOf(s), turnCount: s.turnCount, createdAt: s.createdAt },
            })
          }
          onResumeSession={(s) => dispatch({ type: "startChat", ...seedOf(s), restore: true })}
        />
      ) : view.name === "chat" ? (
        <ChatView
          key={`${view.sessionId}:${chatKey}`}
          sessionId={view.sessionId}
          mode={view.mode}
          memoryEnabled={view.memoryEnabled}
          title={view.title}
          saveTranscripts={saveTranscripts}
          restore={view.restore === true || chatKey > 0}
          recap={view.recap}
          onEnd={(messages) => void endSession(view.sessionId, messages)}
          onOpenInspector={openInspector}
          onReload={() => void reloadChat()}
          onHome={() => dispatch({ type: "home" })}
        />
      ) : view.name === "detail" ? (
        <SessionDetail
          key={view.sessionId}
          session={view}
          onBack={() => dispatch({ type: "home", tab: "history" })}
          onNewSession={(mode, recap) => void startSession(mode, true, recap)}
        />
      ) : view.name === "summary" ? (
        <SessionSummary
          sessionId={view.sessionId}
          title={view.title}
          memoryEnabled={view.memoryEnabled}
          messages={endedMessages.current}
          onHome={() => dispatch({ type: "home" })}
          onHistory={() => dispatch({ type: "home", tab: "history" })}
          onOpenInspector={openInspector}
        />
      ) : (
        <PanelLoading />
      )}
      <MemoryInspector
        open={state.inspectorOpen}
        onOpenChange={(o) => dispatch({ type: "inspector", open: o })}
      />
      {me && (
        <HistorySettings
          open={state.settingsOpen}
          onOpenChange={(o) => dispatch({ type: "settings", open: o })}
          saveTranscripts={saveTranscripts}
          onSaveTranscriptsChange={(value) => identify({ ...me, saveTranscripts: value })}
        />
      )}
    </PanelFrame>
  );
}
