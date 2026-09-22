import type { UIMessage } from "ai";
import type { ChatRequest } from "@/lib/schemas/api";

type RequestMessage = ChatRequest["messages"][number];

export function textOf(message: RequestMessage): string {
  return message.parts
    .flatMap((p) =>
      p.type === "text" && "text" in p && typeof p.text === "string" ? [p.text] : [],
    )
    .join("\n")
    .trim();
}

/**
 * Keep only user/assistant TEXT from the last `turns` exchanges. Data parts,
 * reasoning and anything else the client echoes back are dropped, so prior
 * reasoning is never sent back to the model and memory chips stay UI-only.
 */
export function trimHistory(messages: readonly RequestMessage[], turns: number): UIMessage[] {
  const cleaned: UIMessage[] = [];
  for (const m of messages) {
    const text = textOf(m);
    if (!text) continue;
    cleaned.push({ id: m.id, role: m.role, parts: [{ type: "text", text }] });
  }
  // Drop leading assistant messages so history starts with a user turn.
  let start = Math.max(0, cleaned.length - turns * 2);
  while (start < cleaned.length && cleaned[start]?.role !== "user") start++;
  return cleaned.slice(start);
}
