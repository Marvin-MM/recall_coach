"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { BrainCircuit, Download, EyeOff, RotateCcw, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { coachLimits } from "@/config/coach";
import { safeSession } from "@/lib/browser-storage";
import type { CoachUIMessage } from "@/types/chat";
import type { CoachingMode } from "@/types/domain";
import {
  conversationToMarkdown,
  downloadText,
  memoryPartOf,
  messageText,
} from "./export-conversation";
import { MessageMemoryChips } from "./message-memory-chips";
import { parseScorecard, Scorecard } from "./scorecard";

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

const storageKey = (sessionId: string) => `recall:chat:${sessionId}`;

function loadMessages(sessionId: string): CoachUIMessage[] {
  const raw = safeSession.get(storageKey(sessionId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as CoachUIMessage[]) : [];
  } catch {
    return [];
  }
}

/** Server errors arrive as JSON in the Error message; show the human part. */
export function readableError(error: Error): { message: string; ended: boolean } {
  try {
    const body = JSON.parse(error.message) as { error?: { code?: string; message?: string } };
    if (body.error?.message) {
      return { message: body.error.message, ended: body.error.code === "CONFLICT" };
    }
  } catch {
    // not JSON — streamed error text
  }
  return {
    message: error.message || "Something went wrong. Please retry.",
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
  onEnd: (messages: CoachUIMessage[]) => void;
  onOpenInspector: () => void;
}

export function ChatView({
  sessionId,
  mode,
  memoryEnabled,
  title,
  onEnd,
  onOpenInspector,
}: ChatViewProps) {
  const [initialMessages] = useState(() => loadMessages(sessionId));
  const transport = useMemo(
    () =>
      new DefaultChatTransport<CoachUIMessage>({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages }) => ({
          body: { sessionId, messages: messages.slice(-coachLimits.maxMessages) },
        }),
      }),
    [sessionId],
  );
  const { messages, sendMessage, status, stop, error, regenerate, clearError } =
    useChat<CoachUIMessage>({
      id: sessionId,
      messages: initialMessages,
      transport,
      experimental_throttle: 50,
    });

  const [announcement, setAnnouncement] = useState("");
  const previousStatus = useRef(status);
  const busy = status === "submitted" || status === "streaming";

  // Persist the transcript locally (this tab only) so "Expand" keeps state.
  useEffect(() => {
    if (!busy) safeSession.set(storageKey(sessionId), JSON.stringify(messages));
  }, [busy, messages, sessionId]);

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
    if (!trimmed || busy) return;
    clearError();
    void sendMessage({ text: trimmed.slice(0, coachLimits.maxTextPartChars) });
  }

  function exportConversation() {
    const md = conversationToMarkdown({ title, memoryEnabled, messages });
    downloadText(`${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`, md);
  }

  const err = error ? readableError(error) : null;

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

      <Conversation className="min-h-0" aria-live="off" aria-label="Conversation">
        <ConversationContent className="gap-6 px-3 py-4 sm:px-4">
          {messages.length === 0 && (
            <div className="space-y-2 py-6 text-sm">
              <p className="font-medium">Ready when you are.</p>
              <p className="text-muted-foreground">
                {memoryEnabled
                  ? "Ask what to work on — I'll start from what I remember about your last sessions."
                  : "This session starts from a blank slate, so you can compare it with a memory session."}
              </p>
            </div>
          )}
          {messages.map((m, i) => {
            const text = messageText(m);
            const memory = m.role === "assistant" ? memoryPartOf(m) : null;
            const streamingThis = busy && i === messages.length - 1 && m.role === "assistant";
            const card = m.role === "assistant" && !streamingThis ? parseScorecard(text) : null;
            return (
              <Message key={m.id} from={m.role === "user" ? "user" : "assistant"}>
                {memory && <MessageMemoryChips part={memory} />}
                <MessageContent className="group-[.is-user]:rounded-none group-[.is-user]:bg-accent">
                  {m.role === "assistant" ? (
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
          {err && (
            <div
              role="alert"
              className="flex flex-col gap-2 border-l-2 border-destructive bg-card p-3 text-sm"
            >
              <p className="text-destructive">{err.message}</p>
              {!err.ended && (
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
              <PromptInputSubmit status={status} aria-label="Send message" />
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
