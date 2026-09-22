import { RUBRIC_DIMENSIONS, type RubricDimension } from "@/config/coach";

export interface ParsedScorecard {
  scores: Partial<Record<RubricDimension, number>>;
  fix: string | null;
}

const SCORE_RE = new RegExp(`(${RUBRIC_DIMENSIONS.join("|")})\\s*[:\\-]?\\s*(\\d)\\s*/\\s*5`, "gi");
const FIX_RE = /\*{0,2}Fix next time:?\*{0,2}\s*:?\s*(.+)/i;

/** Extract rubric scores + the "Fix next time" line from a coach reply. */
export function parseScorecard(text: string): ParsedScorecard | null {
  const scores: Partial<Record<RubricDimension, number>> = {};
  for (const m of text.matchAll(SCORE_RE)) {
    const dim = RUBRIC_DIMENSIONS.find((d) => d.toLowerCase() === (m[1] ?? "").toLowerCase());
    const value = Number(m[2]);
    if (dim && value >= 1 && value <= 5) scores[dim] = value;
  }
  if (Object.keys(scores).length < 2) return null;
  const fix = FIX_RE.exec(text)?.[1]?.replace(/\*+/g, "").trim() ?? null;
  return { scores, fix };
}

/** Compact rubric scorecard (screen-reader friendly). */
export function Scorecard({ card }: { card: ParsedScorecard }) {
  return (
    <figure
      className="@container border border-border bg-card p-3 text-xs"
      aria-label="Rubric scorecard"
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 @lg:grid-cols-4">
        {RUBRIC_DIMENSIONS.map((dim) => {
          const score = card.scores[dim];
          return (
            <div key={dim}>
              <dt className="text-muted-foreground">{dim}</dt>
              <dd className="mt-0.5 flex items-center gap-1.5">
                <span className="font-mono font-tabular text-sm text-foreground">
                  {score ?? "–"}
                  <span className="text-muted-foreground">/5</span>
                </span>
                <span className="flex gap-0.5" aria-hidden>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span
                      key={n}
                      className={`h-1.5 w-2 ${score !== undefined && n <= score ? "bg-link" : "bg-border"}`}
                    />
                  ))}
                </span>
              </dd>
            </div>
          );
        })}
      </dl>
      {card.fix && (
        <figcaption className="mt-3 border-t border-border pt-2 text-foreground">
          <span className="font-medium">Fix next time: </span>
          {card.fix}
        </figcaption>
      )}
    </figure>
  );
}
