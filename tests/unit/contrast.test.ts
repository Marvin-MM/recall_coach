import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Parse `--name: #hex;` declarations from a CSS block (e.g. ":root {" or ".dark {"). */
function tokens(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`block ${selector} not found`);
  const body = css.slice(start, css.indexOf("\n}", start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)) {
    if (m[1] && m[2]) out[m[1]] = m[2].toLowerCase();
  }
  return out;
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

/** `fg` at `alpha` opacity over opaque `bg`, as #rrggbb. */
function blend(fg: string, bg: string, alpha: number): string {
  const ch = (hex: string, i: number) => Number.parseInt(hex.slice(i, i + 2), 16);
  return `#${[1, 3, 5]
    .map((i) =>
      Math.round(ch(fg, i) * alpha + ch(bg, i) * (1 - alpha))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const themes = { light: tokens(css, ":root"), dark: tokens(css, ".deep") };

/** [foreground token, background token] — body text: ≥ 4.5:1 */
const TEXT_PAIRS: [string, string][] = [
  ["foreground", "background"],
  ["foreground", "card"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["muted-foreground", "muted"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
  ["link", "background"],
  ["link", "card"],
  ["link", "accent"],
  ["destructive", "background"],
  ["destructive", "card"],
  ["memory-foreground", "memory"],
  ["warning-foreground", "warning"],
];

/** UI component boundaries and focus indicators: ≥ 3:1 */
const UI_PAIRS: [string, string][] = [
  ["ring", "background"],
  ["ring", "card"],
  ["input", "background"],
  ["input", "card"],
];

describe.each(Object.entries(themes))("%s theme contrast (WCAG 2.1 AA)", (_name, t) => {
  it.each(TEXT_PAIRS)("%s on %s ≥ 4.5:1", (fg, bg) => {
    const a = t[fg];
    const b = t[bg];
    expect(a, `missing --${fg}`).toBeDefined();
    expect(b, `missing --${bg}`).toBeDefined();
    expect(contrast(a ?? "", b ?? "")).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI_PAIRS)("%s on %s ≥ 3:1", (fg, bg) => {
    expect(contrast(t[fg] ?? "", t[bg] ?? "")).toBeGreaterThanOrEqual(3);
  });

  // Destructive buttons/badges: `text-destructive` on `bg-destructive/10` (light)
  // or `/20` (dark), composited over the surface they sit on.
  it.each(["background", "card", "popover"])(
    "destructive on tinted destructive over %s ≥ 4.5:1",
    (surface) => {
      const fg = t.destructive ?? "";
      const alpha = _name === "light" ? 0.1 : 0.2;
      expect(contrast(fg, blend(fg, t[surface] ?? "", alpha))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("never puts white text on Sui blue", () => {
    expect(t["primary-foreground"]).not.toBe("#ffffff");
    expect(contrast("#ffffff", "#4da2ff")).toBeLessThan(4.5); // documents why
  });
});

describe("contrast()", () => {
  it("matches known reference values", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });
});
