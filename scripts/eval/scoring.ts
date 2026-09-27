/**
 * Deterministic keyword scoring for the memory eval. No model grading: a
 * probe passes when the reply contains enough of the expected keywords.
 */

/** Lower-case, straight quotes, collapsed whitespace. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/\s+/g, " ");
}

export interface KeywordScore {
  pass: boolean;
  matched: string[];
  required: number;
}

export function scoreReply(reply: string, keywords: readonly string[], minHits = 1): KeywordScore {
  const hay = normalize(reply);
  const matched = keywords.filter((k) => hay.includes(normalize(k)));
  const required = Math.min(minHits, keywords.length);
  return { pass: keywords.length > 0 && matched.length >= required, matched, required };
}

const STOPWORDS = new Set([
  "about",
  "after",
  "answer",
  "answers",
  "before",
  "being",
  "clear",
  "every",
  "first",
  "from",
  "into",
  "just",
  "make",
  "more",
  "next",
  "once",
  "only",
  "question",
  "said",
  "should",
  "some",
  "state",
  "that",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "time",
  "what",
  "when",
  "which",
  "with",
  "your",
]);

/**
 * Keywords for the "last assignment" probe, derived from the coach's own
 * session-1 fix: distinct content words (≥ 4 letters, not stopwords), in
 * order, at most 6. The probe needs 2 of them (or all, if fewer).
 */
export function fixKeywords(fix: string): string[] {
  const words = normalize(fix).match(/[a-z][a-z0-9-]{3,}/g) ?? [];
  const out: string[] = [];
  for (const w of words) {
    if (!STOPWORDS.has(w) && !out.includes(w)) out.push(w);
    if (out.length === 6) break;
  }
  return out;
}

export const FIX_MIN_HITS = 2;

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? null)
    : Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
}
