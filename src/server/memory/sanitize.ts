/**
 * Defences against prompt injection via memory. Two layers:
 * 1. `stripInstructionMarkup` — applied to every stored line: removes role/tool
 *    tags, chat-template tokens, code fences and header-like brackets so a
 *    memory can never impersonate a system message or a fake memory header.
 * 2. `containsInjection` — facts that still read like directives to the model
 *    are DROPPED before storage (counted as `droppedInjection`).
 */
const INJECTION_MARKERS: readonly RegExp[] = [
  /\bignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier)\b/i,
  /\bdisregard\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier|instructions)\b/i,
  /\bforget\s+(all\s+|your\s+|the\s+)?(previous|prior|instructions|rules)\b/i,
  /\b(new|updated|override)\s+(system\s+)?instructions?\b/i,
  /\b(system|assistant|developer|tool)\s*:/i,
  /\byou\s+(must|should|will)\s+(now\s+)?(always|never|ignore|obey|follow|respond|reply|say|act)\b/i,
  /\byou\s+must\b/i,
  /\bact\s+as\s+(an?\s+)?(different|new|unrestricted|jailbroken)\b/i,
  /\bjailbreak|\bDAN\s+mode\b/i,
  /<\/?\s*(system|assistant|user|developer|tool|instructions?|coach_memory)[^>]*>/i,
  /<\|[^|]{1,40}\|>/,
  /\[\/?(INST|SYS)\]/i,
  /^\s*#{2,}\s*(system|instructions?)/im,
];

export function containsInjection(text: string): boolean {
  return INJECTION_MARKERS.some((re) => re.test(text));
}

export function stripInstructionMarkup(text: string): string {
  return (
    text
      // chat-template tokens and role/tool tags
      .replace(/<\|[^|]{0,40}\|>/g, " ")
      .replace(/<\/?\s*[a-z_:-]{1,30}(\s[^>]{0,80})?>/gi, " ")
      .replace(/\[\/?(INST|SYS)\]/gi, " ")
      // code fences / markdown headers
      .replace(/```+/g, " ")
      .replace(/^\s*#{1,6}\s*/gm, "")
      // square brackets could forge a memory header — neutralize them
      .replace(/\[/g, "(")
      .replace(/\]/g, ")")
      // control characters (incl. null bytes) and collapsed whitespace
      .replace(/\p{Cc}+/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}
