import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CLAUDE.md rule 4: src/server/{chat,llm,memory} may import ONLY
 * thread-history.ts from src/server/transcripts/. Biome's noRestrictedImports
 * enforces the same rule at lint time; this test catches anything lint could
 * miss (dynamic imports, re-exports, new directories).
 */

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const TRANSCRIPTS = join(SRC, "server", "transcripts");
const ALLOWED = join(TRANSCRIPTS, "thread-history");
const GUARDED_DIRS = ["chat", "llm", "memory"].map((d) => join(SRC, "server", d));

const SPECIFIER =
  /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function resolveSpecifier(fromFile: string, spec: string): string | null {
  if (spec.startsWith("@/")) return join(SRC, spec.slice(2));
  if (spec.startsWith(".")) return resolve(dirname(fromFile), spec);
  return null; // package import
}

/** Returns the forbidden transcript imports in one source file. */
function forbiddenTranscriptImports(fromFile: string, source: string): string[] {
  const bad: string[] = [];
  for (const m of source.matchAll(SPECIFIER)) {
    const spec = m[1] ?? m[2];
    if (!spec) continue;
    const target = resolveSpecifier(fromFile, spec)?.replace(/\.(ts|tsx|js)$/, "");
    if (!target) continue;
    const insideTranscripts = target === TRANSCRIPTS || target.startsWith(`${TRANSCRIPTS}/`);
    if (insideTranscripts && target !== ALLOWED) bad.push(spec);
  }
  return bad;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("transcript import guard", () => {
  it("flags forbidden imports and allows thread-history (self-test)", () => {
    const file = join(SRC, "server", "chat", "example.ts");
    const source = [
      'import { createTranscriptStore } from "@/server/transcripts/transcript-store";',
      'import type { TranscriptKeyring } from "../transcripts/crypto";',
      'const lazy = () => import("@/server/transcripts/crypto");',
      'export { FAILED_REPLY_TEXT } from "../transcripts/transcript-store";',
      'import { loadThreadHistory } from "@/server/transcripts/thread-history";',
      'import type { ThreadMessage } from "../transcripts/thread-history.ts";',
      'import { streamText } from "ai";',
    ].join("\n");
    expect(forbiddenTranscriptImports(file, source)).toEqual([
      "@/server/transcripts/transcript-store",
      "../transcripts/crypto",
      "@/server/transcripts/crypto",
      "../transcripts/transcript-store",
    ]);
  });

  it("src/server/chat, llm and memory import only thread-history.ts from transcripts", () => {
    const violations = GUARDED_DIRS.flatMap(walk).flatMap((file) =>
      forbiddenTranscriptImports(file, readFileSync(file, "utf8")).map(
        (spec) => `${relative(ROOT, file)} → ${spec}`,
      ),
    );
    expect(violations).toEqual([]);
  });

  it("thread-history.ts exports only loadThreadHistory at runtime", async () => {
    const mod = await import("@/server/transcripts/thread-history");
    expect(Object.keys(mod)).toEqual(["loadThreadHistory"]);
  });
});
