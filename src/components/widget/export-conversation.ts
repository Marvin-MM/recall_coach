import { siteConfig } from "@/config/site";
import type { CoachUIMessage, MemoryDataPart } from "@/types/chat";

export function messageText(message: CoachUIMessage): string {
  return message.parts
    .flatMap((p) => (p.type === "text" ? [p.text] : []))
    .join("\n")
    .trim();
}

export function memoryPartOf(message: CoachUIMessage): MemoryDataPart | null {
  for (const p of message.parts) if (p.type === "data-memory") return p.data;
  return null;
}

/**
 * Markdown export of the conversation, built entirely in the browser from
 * the messages on screen (nothing extra is sent to the server).
 */
export function conversationToMarkdown(args: {
  title: string;
  memoryEnabled: boolean;
  messages: readonly CoachUIMessage[];
  exportedAt?: Date;
}): string {
  const lines = [
    `# ${args.title}`,
    "",
    `Exported from ${siteConfig.name} on ${(args.exportedAt ?? new Date()).toISOString()} · memory ${
      args.memoryEnabled ? "on" : "off (Amnesia Mode)"
    }`,
    "",
  ];
  for (const m of args.messages) {
    const text = messageText(m);
    if (!text) continue;
    lines.push(`## ${m.role === "user" ? "You" : "Coach"}`, "");
    const mem = m.role === "assistant" ? memoryPartOf(m) : null;
    if (mem && mem.recalled.length > 0) {
      lines.push(
        `> Recalled ${mem.recalled.length} ${mem.recalled.length === 1 ? "memory" : "memories"}:`,
        ...mem.recalled.map((c) => `> - (${c.kind}) ${c.snippet} — blob \`${c.blobId}\``),
        "",
      );
    }
    lines.push(text, "");
  }
  return lines.join("\n");
}

export function downloadText(filename: string, content: string, type = "text/markdown"): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
