/**
 * pnpm groq:checks — small, sourced measurements behind FRICTION.md's
 * "Qwen 3.8 on Groq" section. Groq only (no Walrus calls, no writes).
 *
 *  1. Latency: the same prompt with reasoning off (`reasoningEffort: "none"`)
 *     vs on (`"default"`), alternating, 3 runs each.
 *  2. Strict JSON schema: does Groq accept a schema with an optional field?
 *  3. Tag adherence: the real extraction (`extractMemories`) on the eval's
 *     session-1 exchanges, 2 runs each; every fact's tag must be in the enum.
 *
 *   pnpm groq:checks [eval/results/<runId>]   # (3) reads that run's session1.json
 * Writes eval/results/groq-checks-<date>/results.json. Never prints secrets.
 */
import "./load-env";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const GAP_MS = 12_000; // Groq on_demand ITPM is small; stay well under it

async function main(): Promise<void> {
  const { env } = await import("../src/env");
  const { createGroq } = await import("@ai-sdk/groq");
  const { generateText, Output } = await import("ai");
  const { z } = await import("zod");
  const { extractMemories } = await import("../src/server/llm/extraction");
  const { MEMORY_TAGS } = await import("../src/server/memory/tags");

  const groq = createGroq({ apiKey: env.GROQ_API_KEY });
  const model = groq(env.GROQ_MODEL);
  const date = new Date().toISOString().slice(0, 10);
  const outDir = path.join("eval", "results", `groq-checks-${date}`);
  await mkdir(outDir, { recursive: true });
  const out: Record<string, unknown> = { date: new Date().toISOString(), model: env.GROQ_MODEL };

  // 1. Latency, reasoning off vs on.
  const prompt =
    "In two sentences, give feedback on this interview answer: 'We had an outage, I restarted the service, and it was fine.'";
  const latency: {
    effort: string;
    ms: number;
    outputTokens: number | null;
    reasoningTokens: number | null;
    textChars: number;
  }[] = [];
  for (let i = 0; i < 3; i++) {
    for (const effort of ["none", "default"] as const) {
      const started = Date.now();
      const r = await generateText({
        model,
        prompt,
        maxOutputTokens: 1500,
        providerOptions: { groq: { reasoningEffort: effort, reasoningFormat: "hidden" } },
      });
      latency.push({
        effort,
        ms: Date.now() - started,
        outputTokens: r.usage.outputTokens ?? null,
        reasoningTokens: r.usage.reasoningTokens ?? null,
        textChars: r.text.length,
      });
      console.log(`latency ${effort}: ${Date.now() - started} ms`);
      await sleep(GAP_MS);
    }
  }
  out.latency = latency;

  // 2. Strict JSON schema with an optional property.
  try {
    const r = await generateText({
      model,
      prompt: 'Return a JSON object with a="x".',
      output: Output.object({ schema: z.object({ a: z.string(), b: z.string().optional() }) }),
      providerOptions: {
        groq: { structuredOutputs: true, strictJsonSchema: true, reasoningEffort: "none" },
      },
      maxRetries: 0,
    });
    out.strictOptional = { accepted: true, output: r.output };
  } catch (error) {
    const e = error as { message?: string; statusCode?: number; responseBody?: string };
    out.strictOptional = {
      accepted: false,
      statusCode: e.statusCode ?? null,
      message: (e.responseBody ?? e.message ?? String(error))
        .replace(/org_[a-z0-9]+/gi, "org_…")
        .slice(0, 600),
    };
  }
  console.log("strict optional:", JSON.stringify(out.strictOptional).slice(0, 200));
  await sleep(GAP_MS);

  // 3. Tag adherence on real session-1 exchanges from an eval run.
  const runDir = process.argv[2];
  if (runDir) {
    const session1 = JSON.parse(await readFile(path.join(runDir, "session1.json"), "utf8")) as {
      persona: string;
      turns: { user: string; coach: string }[];
    }[];
    const tags: {
      persona: string;
      run: number;
      ok: boolean;
      error?: string;
      facts?: { kind: string; tag: string }[];
      assignmentTag?: string | null;
    }[] = [];
    for (const s of session1) {
      const turn = s.turns[1];
      if (!turn) continue;
      for (let run = 1; run <= 2; run++) {
        try {
          const r = await extractMemories({
            model: groq(env.GROQ_EXTRACTION_MODEL),
            lastUserText: turn.user,
            assistantText: turn.coach,
            profile: null,
            knownMistakes: [],
            now: new Date(),
          });
          tags.push({
            persona: s.persona,
            run,
            ok: r.facts.every((f) => (MEMORY_TAGS as readonly string[]).includes(f.tag)),
            facts: r.facts.map((f) => ({ kind: f.kind, tag: f.tag })),
            assignmentTag: r.assignmentTag,
          });
        } catch (error) {
          tags.push({
            persona: s.persona,
            run,
            ok: false,
            error: (error as Error).message.slice(0, 200),
          });
        }
        console.log(`tags ${s.persona} #${run}: ${JSON.stringify(tags.at(-1)).slice(0, 160)}`);
        await sleep(GAP_MS);
      }
    }
    out.tagAdherence = { source: path.join(runDir, "session1.json"), runs: tags };
  }

  await writeFile(path.join(outDir, "results.json"), `${JSON.stringify(out, null, 2)}\n`);
  console.log(`→ ${outDir}/results.json`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
