/**
 * Near-duplicate detection so repeated extraction does not saturate recall
 * with the same fact. Similarity = 1 - normalized Levenshtein distance over a
 * canonical form (lowercase, punctuation stripped, whitespace collapsed).
 */
export const DUPLICATE_THRESHOLD = 0.9;

export function canonical(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/^\s*(\[[a-z]+=[^\]]*\])+\s*/, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min((prev[j] ?? 0) + 1, (curr[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length] ?? 0;
}

export function similarity(a: string, b: string): number {
  const ca = canonical(a);
  const cb = canonical(b);
  const longest = Math.max(ca.length, cb.length);
  if (longest === 0) return 1;
  return 1 - levenshtein(ca, cb) / longest;
}

export function isNearDuplicate(
  candidate: string,
  existing: readonly string[],
  threshold = DUPLICATE_THRESHOLD,
): boolean {
  return existing.some((e) => similarity(candidate, e) >= threshold);
}

/**
 * Drop candidates that duplicate an existing memory OR an earlier candidate
 * in the same batch. Returns kept items and the dropped count.
 */
export function dedupeAgainst<T>(
  candidates: readonly T[],
  existing: readonly string[],
  textOf: (item: T) => string,
  threshold = DUPLICATE_THRESHOLD,
): { kept: T[]; dropped: number } {
  const kept: T[] = [];
  const seen = [...existing];
  for (const item of candidates) {
    const text = textOf(item);
    if (isNearDuplicate(text, seen, threshold)) continue;
    kept.push(item);
    seen.push(text);
  }
  return { kept, dropped: candidates.length - kept.length };
}
