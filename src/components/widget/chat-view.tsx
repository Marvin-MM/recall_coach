"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  BrainCircuit,
  Download,
  EyeOff,
  History,
  RotateCcw,
  Square,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { coachLimits } from "@/config/coach";
import { ApiError, api } from "@/lib/api-client";
import type { CoachUIMessage } from "@/types/chat";
import type { CoachingMode } from "@/types/domain";
import {
  conversationToMarkdown,
  downloadText,
  memoryPartOf,
  messageText,
} from "./export-conversation";
import { MessageMemoryChips } from "./message-memory-chips";
import { PreviousSavesNotice } from "./previous-saves-notice";
import { parseScorecard, Scorecard } from "./scorecard";
import type { RecapSeed } from "./state";
import { buildClientHistory, latestNextSeq, transcriptToUiMessages } from "./thread-utils";

const SUGGESTIONS: Record<CoachingMode, string[]> = {
  mock_interview: [
    "Let's practice. What should I work on?",
    "Ask me a behavioral question",
    "Give me a system design question",
  ],
  drill: ["Drill my weakest spot", "What mistake do I repeat most?", "Give me a quick exercise"],
  review: [
    "How have I improved so far?",
    "What still trips me up?",
    "Plan my next three practice sessions",
  ],
  free_chat: [
    "Let's practice. What should I work on?",
    "How should I prepare this week?",
    "How do I answer 'tell me about yourself'?",
  ],
};

const ENDED_CODES = new Set(["SESSION_ENDED", "SESSION_IDLE"]);

/** Server errors arrive as JSON in the Error message; show the human part. */
export function readableError(error: Error): {
  message: string;
  code: string | null;
  ended: boolean;
} {
  try {
    const body = JSON.parse(error.message) as { error?: { code?: string; message?: string } };
    if (body.error?.message) {
      const code = body.error.code ?? null;
      return { message: body.error.message, code, ended: code !== null && ENDED_CODES.has(code) };
    }
  } catch {
    // not JSON — streamed error text
  }
  return {
    message: error.message || "Something went wrong. Please retry.",
    code: null,
    ended: false,
  };
}

function stripScorecardLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s*\*{0,2}(Scorecard|Fix next time)/i.test(line))
    .join("\n")
    .trim();
}

export interface ChatViewProps {
  sessionId: string;
  mode: CoachingMode;
  memoryEnabled: boolean;
  title: string;
  /** Conversation history on: turns are stored encrypted and restored. */
  saveTranscripts: boolean;
  /** Reopen with the stored transcript (unfinished session). */
  restore?: boolean;
  recap?: RecapSeed | undefined;
  onEnd: (messages: CoachUIMessage[]) => void;
  onOpenInspector: () => void;
  /** The history setting changed elsewhere: re-read settings and reopen this chat. */
  onReload: () => void;
  onHome: () => void;
}

type Loaded = { messages: CoachUIMessage[]; nextSeq: number };

/** Loads the stored thread first (history on + restore), then mounts the chat. */
export function ChatView(props: ChatViewProps) {
  const needsTranscript = props.saveTranscripts && props.restore === true;
  const [loaded, setLoaded] = useState<Loaded | null>(
    needsTranscript ? null : { messages: [], nextSeq: 0 },
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const t = await api.sessionMessages(props.sessionId);
      setLoaded({ messages: transcriptToUiMessages(t.messages), nextSeq: t.nextSeq });
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : "Couldn't load this conversation.");
    }
  }, [props.sessionId]);

  useEffect(() => {
    if (needsTranscript) void load();
  }, [needsTranscript, load]);

  if (loadError) {
    return (
      <div role="alert" className="flex flex-1 flex-col items-start gap-3 p-5 text-sm">
        <p>{loadError}</p>
        <Button variant="outline" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }
  if (!loaded) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Restoring your conversation"
        className="space-y-3 p-4"
      >
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="ml-auto h-10 w-2/3" />
        <Skeleton className="h-16 w-4/5" />
      </div>
    );
  }
  return <ChatThread {...props} initial={loaded} key={props.sessionId} />;
}

function ChatThread({
  sessionId,
  mode,
  memoryEnabled,
  title,
  saveTranscripts,
  recap,
  initial,
  onEnd,
  onOpenInspector,
  onReload,
  onHome,
}: ChatViewProps & { initial: Loaded }) {
  const nextSeq = useRef(initial.nextSeq);
  const transport = useMemo(
    () =>
      new DefaultChatTransport<CoachUIMessage>({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages }) => {
          const last = messages.at(-1);
          const message = last ? messageText(last).slice(0, coachLimits.maxTextPartChars) : "";
          // History on: the server rebuilds the thread from this session's
          // encrypted transcript. History off: send this page's thread only.
          return saveTranscripts
            ? { body: { sessionId, message, expectedSeq: nextSeq.current } }
            : { body: { sessionId, message, history: buildClientHistory(messages.slice(0, -1)) } };
        },
      }),
    [sessionId, saveTranscripts],
  );
  const { messages, setMessages, sendMessage, status, stop, error, regenerate, clearError } =
    useChat<CoachUIMessage>({
      id: sessionId,
      messages: initial.messages,
      transport,
      experimental_throttle: 50,
    });

  const [announcement, setAnnouncement] = useState("");
  const previousStatus = useRef(status);
  const busy = status === "submitted" || status === "streaming";
  const err = error ? readableError(error) : null;

  // Follow the server's seq: every accepted turn stores a user row + a reply row.
  useEffect(() => {
    if (busy) return;
    const seq = latestNextSeq(messages);
    if (seq !== undefined && seq > nextSeq.current) nextSeq.current = seq;
  }, [busy, messages]);

  // Another tab moved this thread on (409 STALE_THREAD): reload the stored version.
  const reloading = useRef(false);
  useEffect(() => {
    if (err?.code === "STALE_THREAD" && !reloading.current) {
      reloading.current = true;
      void api
        .sessionMessages(sessionId)
        .then((t) => {
          nextSeq.current = t.nextSeq;
          setMessages(transcriptToUiMessages(t.messages));
          clearError();
          toast.info("This conversation changed in another tab — showing the latest version.");
        })
        .catch(() => toast.error("Couldn't reload this conversation. Please refresh."))
        .finally(() => {
          reloading.current = false;
        });
    } else if (err?.code === "HISTORY_SETTING_CHANGED") {
      onReload();
    }
  }, [err?.code, sessionId, setMessages, clearError, onReload]);

  // Announce only COMPLETED replies to screen readers (not every token).
  useEffect(() => {
    const was = previousStatus.current;
    previousStatus.current = status;
    if ((was === "streaming" || was === "submitted") && status === "ready") {
      const last = messages.at(-1);
      if (last?.role === "assistant") {
        setAnnouncement(`Coach replied: ${messageText(last).slice(0, 400)}`);
      }
    }
  }, [status, messages]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy || err?.ended) return;
    clearError();
    void sendMessage({ text: trimmed.slice(0, coachLimits.maxTextPartChars) });
  }

  function exportConversation() {
    const md = conversationToMarkdown({ title, memoryEnabled, messages });
    downloadText(`${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`, md);
  }

  const showRecap = messages.length === 0 && recap && recap.items.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b border-border px-3 py-1.5">
        <p className="mr-auto truncate text-xs text-muted-foreground">
          {title}
          <span className="sr-only">, memory {memoryEnabled ? "on" : "off"}</span>
        </p>
        {memoryEnabled && (
          <Button variant="ghost" size="sm" onClick={onOpenInspector}>
            <BrainCircuit aria-hidden />
            What I remember
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={exportConversation}
          disabled={messages.length === 0}
          aria-label="Export this conversation as Markdown"
          title="Export conversation (downloads locally)"
        >
          <Download aria-hidden />
        </Button>
        <Button variant="outline" size="sm" onClick={() => onEnd(messages)} disabled={busy}>
          End session
        </Button>
      </div>

      {!memoryEnabled && (
        <p
          className="flex items-center gap-2 border-b border-border bg-muted px-3 py-2 text-xs text-foreground"
          role="note"
        >
          <EyeOff className="size-3.5 shrink-0" aria-hidden />
          Amnesia Mode: nothing is recalled or saved.
        </p>
      )}
      {memoryEnabled && <PreviousSavesNotice sessionId={sessionId} />}
      {!saveTranscripts && (
        <p
          className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted-foreground"
          role="note"
        >
          <History className="size-3.5 shrink-0" aria-hidden />
          History is off — this conversation won't be saved or restored.
        </p>
      )}

      <Conversation className="min-h-0" aria-live="off" aria-label="Conversation">
        <ConversationContent className="gap-6 px-3 py-4 sm:px-4">
          {messages.length === 0 && (
            <div className="space-y-3 py-6 text-sm">
              <p className="font-medium">Ready when you are.</p>
              <p className="text-muted-foreground">
                {memoryEnabled
                  ? "Ask what to work on — I'll start from what I remember about your last sessions."
                  : "This session starts from a blank slate, so you can compare it with a memory session."}
              </p>
              {showRecap && (
                <section
                  aria-labelledby="chat-recap"
                  className="space-y-1.5 border-l-2 border-link bg-card py-2 pr-3 pl-3"
                >
                  <h4 id="chat-recap" className="flex items-center gap-1.5 text-xs font-medium">
                    <History className="size-3.5 text-link" aria-hidden />
                    Picking up from {recap.fromTitle}
                  </h4>
                  <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                    {recap.items.slice(0, 4).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
          {messages.map((m, i) => {
            const text = messageText(m);
            const memory = m.role === "assistant" ? memoryPartOf(m) : null;
            const streamingThis = busy && i === messages.length - 1 && m.role === "assistant";
            const card = m.role === "assistant" && !streamingThis ? parseScorecard(text) : null;
            const stored = m.metadata?.status;
            return (
              <Message key={m.id} from={m.role === "user" ? "user" : "assistant"}>
                {memory && <MessageMemoryChips part={memory} />}
                <MessageContent className="group-[.is-user]:rounded-none group-[.is-user]:bg-accent">
                  {stored === "failed" || stored === "unreadable" ? (
                    <p className="flex items-center gap-1.5 text-muted-foreground italic">
                      <TriangleAlert className="size-3.5" aria-hidden />
                      {stored === "failed"
                        ? "Response failed"
                        : "This message couldn't be decrypted."}
                    </p>
                  ) : m.role === "assistant" ? (
                    <>
                      {card && <Scorecard card={card} />}
                      {text ? (
                        <MessageResponse>{card ? stripScorecardLines(text) : text}</MessageResponse>
                      ) : (
                        streamingThis && <Shimmer>Thinking…</Shimmer>
                      )}
                    </>
                  ) : (
                    <p className="whitespace-pre-wrap">{text}</p>
                  )}
                </MessageContent>
              </Message>
            );
          })}
          {status === "submitted" && messages.at(-1)?.role === "user" && (
            <Message from="assistant">
              <Shimmer>{memoryEnabled ? "Checking what I remember…" : "Thinking…"}</Shimmer>
            </Message>
          )}
          {err && err.code !== "STALE_THREAD" && err.code !== "HISTORY_SETTING_CHANGED" && (
            <div
              role="alert"
              className="flex flex-col gap-2 border-l-2 border-destructive bg-card p-3 text-sm"
            >
              <p className="text-destructive">{err.message}</p>
              {err.ended ? (
                <Button variant="outline" size="sm" className="self-start" onClick={onHome}>
                  Start a new session
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() => void regenerate()}
                >
                  <RotateCcw aria-hidden />
                  Retry
                </Button>
              )}
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton aria-label="Scroll to latest message" />
      </Conversation>

      <div className="border-t border-border p-3">
        {messages.length === 0 && (
          <Suggestions className="mb-2">
            {SUGGESTIONS[mode].map((s) => (
              <Suggestion
                key={s}
                suggestion={s}
                onClick={send}
                className="rounded-none"
                disabled={busy}
              />
            ))}
          </Suggestions>
        )}
        <PromptInput onSubmit={(message) => send(message.text)} className="rounded-none">
          <PromptInputBody>
            <PromptInputTextarea
              placeholder="Type your answer… (Enter to send, Shift+Enter for a new line)"
              aria-label="Message the coach"
              maxLength={coachLimits.maxTextPartChars}
              disabled={Boolean(err?.ended)}
            />
          </PromptInputBody>
          <PromptInputFooter className="justify-end">
            {busy ? (
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                onClick={() => void stop()}
                aria-label="Stop generating"
              >
                <Square aria-hidden />
              </Button>
            ) : (
              <PromptInputSubmit
                status={status}
                disabled={Boolean(err?.ended)}
                aria-label="Send message"
              />
            )}
          </PromptInputFooter>
        </PromptInput>
      </div>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </div>
  );
}
