import type { ModelMessage } from "ai";

export interface ThreadTurn {
  role: "user" | "assistant";
  text: string;
}

/**
 * Model input for the CURRENT thread only: the newest `turns` exchanges,
 * starting with a user turn, as plain text messages (no data parts, no
 * reasoning). Cross-session context never comes from here — only from the
 * Walrus recall in the system prompt.
 */
export function toModelMessages(thread: readonly ThreadTurn[], turns: number): ModelMessage[] {
  const cleaned = thread.filter((m) => m.text.trim().length > 0);
  let start = Math.max(0, cleaned.length - turns * 2);
  while (start < cleaned.length && cleaned[start]?.role !== "user") start++;
  return cleaned.slice(start).map((m) => ({ role: m.role, content: m.text }));
}
