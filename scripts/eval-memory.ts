/**
 * pnpm eval:memory — does memory change the coach's answers? (Mainnet)
 *
 * For 3 synthetic personas (scripts/eval/personas.ts):
 *  1. Session 1 (memory on): two scripted turns through the REAL chat
 *     service (createChatService → recall → Groq → after() → persistTurn),
 *     saving to Walrus Memory in throwaway `callback-eval-<runId>` namespaces.
 *  2. Wait until every save job is `done` (reconcile) and recall sees them.
 *  3. Session 2, twice per probe, each a fresh thread: Amnesia Mode vs memory
 *     on. Consent is withdrawn first, so probes read memory but write nothing.
 *  4. Deterministic keyword scoring; everything is saved to
 *     eval/results/<runId>/ plus SUMMARY.md.
 *
 * Guards: ≤ 30 Walrus writes (hard cap in a MemoryPort wrapper), ≤ 20
 * relayer requests per minute (sliding window, incl. estimated job polls),
 * paced Groq calls with backoff on 429. Local PGlite only: no app database is
 * touched. Never prints secrets.
 *
 *   pnpm eval:memory             # Mainnet run
 *   pnpm eval:memory --dry-run   # fake memory + fake model, no network, nothing saved
 */
import "./load-env";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import {
  PERSONAS,
  type Persona,
  PROBE_CATEGORIES,
  PROBE_QUESTIONS,
  type ProbeCategory,
} from "./eval/personas";
import { FIX_MIN_HITS, fixKeywords, median, scoreReply } from "./eval/scoring";
import { installedVersion } from "./sdk-info";

const DRY = process.argv.includes("--dry-run");
const WRITE_BUDGET = 30;
const RELAYER_PER_MIN = DRY ? 10_000 : 20;
const GROQ_MIN_GAP_MS = DRY ? 0 : 12_000;
const POLL_INTERVAL_MS = 4000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toISOString();
const say = (msg: string) => console.log(`${stamp().slice(11, 19)} ${msg}`);

/** Sliding-window limiter for relayer requests (shared delegate key: stay well under 60/min). */
class RelayerWindow {
  private readonly times: number[] = [];
  count = 0;
  constructor(private readonly perMinute: number) {}
  private prune() {
    const cutoff = Date.now() - 60_000;
    while (this.times.length > 0 && (this.times[0] ?? 0) < cutoff) this.times.shift();
  }
  /** Wait until `n` more requests fit in the last minute. */
  async capacity(n: number) {
    for (;;) {
      this.prune();
      if (this.times.length + n <= this.perMinute) return;
      await sleep(Math.max(250, (this.times[0] ?? Date.now()) + 60_000 - Date.now()));
    }
  }
  record(n = 1) {
    for (let i = 0; i < n; i++) this.times.push(Date.now());
    this.count += n;
  }
}

async function main(): Promise<void> {
  const { env } = await import("../src/env");
  const { createChatService } = await import("../src/server/chat/chat-service");
  const { createCoachingSessionsRepo } = await import(
    "../src/server/db/repositories/coaching-sessions.repo"
  );
  const { createMemoryEventsRepo } = await import(
    "../src/server/db/repositories/memory-events.repo"
  );
  const { createRecallEventsRepo } = await import(
    "../src/server/db/repositories/recall-events.repo"
  );
  const { createUserSettingsRepo } = await import(
    "../src/server/db/repositories/user-settings.repo"
  );
  const schema = await import("../src/server/db/schema");
  const { extractMemories } = await import("../src/server/llm/extraction");
  const { createGroqModelFactory } = await import("../src/server/llm/model");
  const { createFakeModelFactory } = await import("../src/server/llm/fake-model");
  const { createFakeMemory } = await import("../src/server/memory/fake-memory");
  const { createMemWalPort, getMemWalClient } = await import("../src/server/memory/memwal-adapter");
  const { deriveNamespaces } = await import("../src/server/memory/namespace");
  const { noopMemory } = await import("../src/server/memory/noop-memory");
  const { reconcilePendingJobs } = await import("../src/server/memory/reconcile");
  const { parseFixNextTime } = await import("../src/server/memory/assignment");
  const { TtlCache } = await import("../src/lib/ttl-cache");
  const { MemoryUnavailableError } = await import("../src/lib/errors");
  const { createKeyring } = await import("../src/server/transcripts/crypto");
  const { createTranscriptStore } = await import("../src/server/transcripts/transcript-store");
  type MemoryPort = import("../src/server/memory/memory-port").MemoryPort;
  type RecalledMemory = import("../src/types/memory").RecalledMemory;
  type CachedAssignment = import("../src/server/memory/assignment-cache").CachedAssignment;
  type MemoryDataPart = import("../src/types/chat").MemoryDataPart;

  const now = new Date();
  const runId = `${now.toISOString().slice(0, 10).replace(/-/g, "")}-${now.toISOString().slice(11, 16).replace(":", "")}`;
  const prefix = `callback-eval-${runId}`;
  const outDir = DRY
    ? path.join(process.env.TMPDIR ?? "/tmp", `callback-eval-dry-${runId}`)
    : path.join("eval", "results", runId);
  await mkdir(outDir, { recursive: true });
  say(`${DRY ? "DRY RUN" : "Mainnet run"} ${runId} → ${outDir}`);

  // ---------- Memory port: real adapter, write cap + relayer throttle ----------
  const window = new RelayerWindow(RELAYER_PER_MIN);
  let writesUsed = 0;
  let writesRefused = 0;
  let relayerMeta: { relayerVersion?: string; apiVersion?: string; build?: string } = {};

  let inner: MemoryPort;
  if (DRY) {
    inner = createFakeMemory();
  } else {
    const client = getMemWalClient({
      key: env.MEMWAL_PRIVATE_KEY,
      accountId: env.MEMWAL_ACCOUNT_ID,
      serverUrl: env.MEMWAL_SERVER_URL,
      requestTimeoutMs: env.MEMWAL_SAVE_TIMEOUT_MS,
    });
    await window.capacity(1);
    window.record(1);
    const compat = await client.compatibility();
    relayerMeta = {
      relayerVersion: compat.relayerVersion,
      apiVersion: compat.apiVersion,
      ...(compat.build.commit ? { build: compat.build.commit.slice(0, 12) } : {}),
    };
    inner = createMemWalPort(client, {
      recallTimeoutMs: env.MEMWAL_RECALL_TIMEOUT_MS,
      saveTimeoutMs: env.MEMWAL_SAVE_TIMEOUT_MS,
      pollIntervalMs: POLL_INTERVAL_MS,
    });
  }
  const memory: MemoryPort = {
    driver: inner.driver,
    async recall(args) {
      await window.capacity(1);
      window.record(1);
      return inner.recall(args);
    },
    async rememberMany(args) {
      if (writesUsed + args.texts.length > WRITE_BUDGET) {
        writesRefused += args.texts.length;
        say(
          `! write budget: refused ${args.texts.length} write(s) (${writesUsed}/${WRITE_BUDGET} used)`,
        );
        throw new MemoryUnavailableError("eval write budget reached");
      }
      writesUsed += args.texts.length;
      await window.capacity(1);
      window.record(1);
      const started = Date.now();
      try {
        return await inner.rememberMany(args);
      } finally {
        // The SDK polls job status while waiting; count those requests too.
        window.record(Math.ceil((Date.now() - started) / POLL_INTERVAL_MS));
      }
    },
    async jobStatuses(ids) {
      await window.capacity(1);
      window.record(1);
      return inner.jobStatuses(ids);
    },
    health: () => inner.health(),
  };

  // ---------- Local PGlite: the real repositories, nothing shared ----------
  const pg = new PGlite();
  const db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  const sessions = createCoachingSessionsRepo(db);
  const memoryEvents = createMemoryEventsRepo(db);
  const userSettings = createUserSettingsRepo(db);

  const models = DRY
    ? createFakeModelFactory({
        chatReply: (n) =>
          n % 2 === 0
            ? "**Scorecard** — Structure 3/5 · Specificity 2/5 · Impact 2/5 · Communication 3/5\nGood order.\n**Fix next time:** End with the metric that moved.\nNext question?"
            : "Tell me about a production incident you handled.",
      })
    : createGroqModelFactory({
        apiKey: env.GROQ_API_KEY,
        chatModelId: env.GROQ_MODEL,
        extractionModelId: env.GROQ_EXTRACTION_MODEL,
      });

  let lastGroqAt = 0;
  const paceGroq = async () => {
    const wait = lastGroqAt + GROQ_MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastGroqAt = Date.now();
  };

  const results: {
    session1: Record<string, unknown>[];
    probes: ProbeResult[];
  } = { session1: [], probes: [] };

  interface TurnResult {
    reply: string;
    error: string | null;
    memory: MemoryDataPart | null;
    firstTokenMs: number | null;
    totalMs: number;
  }
  interface ProbeResult {
    persona: string;
    category: ProbeCategory;
    mode: "amnesia" | "memory";
    question: string;
    reply: string;
    error: string | null;
    keywords: string[];
    required: number;
    matched: string[];
    pass: boolean | null;
    recalled: { kind: string; blobId: string; snippet: string; seenInSessions?: number }[];
    degraded: boolean | null;
    recallAttempt: number | null;
    recallLatencyMs: number | null;
    firstTokenMs: number | null;
    totalMs: number;
  }

  for (const persona of PERSONAS) {
    await db.insert(schema.user).values({
      id: persona.id,
      name: `${persona.firstName} (eval persona)`,
      email: `${persona.id}@eval.invalid`,
      emailVerified: true,
    });
    await userSettings.completeOnboarding(persona.id, new Date());
    // History off: the eval sends each thread itself (no transcripts written).
    await db
      .update(schema.userSettings)
      .set({ saveTranscripts: false })
      .where(eq(schema.userSettings.userId, persona.id));
  }

  const profileCache = new TtlCache<RecalledMemory>(10 * 60_000);
  const assignmentCache = new TtlCache<CachedAssignment>(10 * 60_000);
  let currentUser = PERSONAS[0] as Persona;
  const afterTasks: (() => Promise<void>)[] = [];
  const service = createChatService({
    requireUser: async () => ({
      id: currentUser.id,
      email: `${currentUser.id}@eval.invalid`,
      name: currentUser.firstName,
      image: null,
    }),
    rateLimit: { enforce: async () => {} },
    sessions,
    userSettings,
    memoryEvents,
    recallEvents: createRecallEventsRepo(db),
    transcripts: createTranscriptStore(
      db,
      createKeyring({ currentKey: Buffer.alloc(32, 7).toString("base64"), currentVersion: 1 }),
    ),
    threadHistory: async () => {
      throw new Error("history is off in the eval");
    },
    memoryFor: (enabled) => (enabled ? memory : noopMemory),
    models,
    extract: async (input) => {
      await paceGroq();
      return extractMemories({ ...input, model: models.extractionModel() });
    },
    after: (task) => {
      afterTasks.push(task);
    },
    namespacePrefix: prefix,
    recallTimeoutMs: env.MEMWAL_RECALL_TIMEOUT_MS,
    profileCache,
    assignmentCache,
  });

  /** One chat turn through the real service; retries Groq rate limits. */
  async function chat(
    sessionId: string,
    message: string,
    history: { role: "user" | "assistant"; text: string }[],
  ): Promise<TurnResult> {
    for (let attempt = 1; ; attempt++) {
      await window.capacity(5); // a turn fires up to 4 recalls at once
      await paceGroq();
      const started = Date.now();
      const res = await service.handle(
        new Request("http://eval.invalid/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId, message, history }),
        }),
      );
      if (!res.ok || !res.body) throw new Error(`chat HTTP ${res.status}: ${await res.text()}`);
      let buffer = "";
      let reply = "";
      let error: string | null = null;
      let memoryPart: MemoryDataPart | null = null;
      let firstTokenMs: number | null = null;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl = buffer.indexOf("\n");
        while (nl >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          nl = buffer.indexOf("\n");
          if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
          const chunk = JSON.parse(line.slice(6)) as {
            type: string;
            delta?: string;
            data?: MemoryDataPart;
            errorText?: string;
          };
          if (chunk.type === "data-memory" && chunk.data) memoryPart = chunk.data;
          if (chunk.type === "text-delta" && chunk.delta) {
            firstTokenMs ??= Date.now() - started;
            reply += chunk.delta;
          }
          if (chunk.type === "error") error = chunk.errorText ?? "error";
        }
      }
      const totalMs = Date.now() - started;
      if (error && /busy|rate|try again/i.test(error) && attempt < 4) {
        say(`  Groq busy (attempt ${attempt}); waiting 30 s`);
        afterTasks.length = 0; // failed turn: nothing to persist
        await sleep(30_000);
        continue;
      }
      return { reply, error, memory: memoryPart, firstTokenMs, totalMs };
    }
  }

  async function runAfter() {
    for (const task of afterTasks.splice(0)) await task();
  }

  // ---------- Session 1 per persona ----------
  const fixes = new Map<string, string | null>();
  for (const persona of PERSONAS) {
    currentUser = persona;
    const session = await sessions.createSession({
      userId: persona.id,
      mode: "mock_interview",
      memoryEnabled: true,
      title: "Eval session 1",
    });
    const history: { role: "user" | "assistant"; text: string }[] = [];
    const turns: Record<string, unknown>[] = [];
    let fix: string | null = null;
    for (const message of persona.session1) {
      say(`${persona.id} session 1 turn ${turns.length + 1}`);
      const t = await chat(session.id, message, history);
      await runAfter(); // persistTurn → Walrus (waits for jobs)
      history.push({ role: "user", text: message }, { role: "assistant", text: t.reply });
      fix = parseFixNextTime(t.reply) ?? fix;
      turns.push({
        user: message,
        coach: t.reply,
        error: t.error,
        firstTokenMs: t.firstTokenMs,
        totalMs: t.totalMs,
      });
    }
    fixes.set(persona.id, fix);
    results.session1.push({ persona: persona.id, sessionId: session.id, turns, fix });
    await sessions.endSession({ id: session.id, userId: persona.id }, new Date());
  }

  // ---------- Wait for every job to be done ----------
  say("waiting for save jobs to finish …");
  const waitStarted = Date.now();
  for (;;) {
    const pending = await db
      .select()
      .from(schema.memoryEvents)
      .where(eq(schema.memoryEvents.status, "pending"));
    if (pending.length === 0) break;
    if (Date.now() - waitStarted > 10 * 60_000) {
      say(`! ${pending.length} job(s) still pending after 10 min; probing anyway`);
      break;
    }
    await reconcilePendingJobs({ memory, memoryEvents, minAgeMs: 0 });
    await sleep(8000);
  }
  const events = await db.select().from(schema.memoryEvents);
  const saveLatencies = events.flatMap((e) =>
    e.status === "done" && e.latencyMs !== null ? [e.latencyMs] : [],
  );
  say(
    `jobs: ${events.filter((e) => e.status === "done").length} done, ${events.filter((e) => e.status === "failed").length} failed, ${events.filter((e) => e.status === "pending").length} pending`,
  );

  // Done ≠ searchable yet: wait until each persona's facts namespace answers
  // a recall with at least as many lines as were saved there (max 2 min).
  if (!DRY) {
    for (const persona of PERSONAS) {
      const ns = deriveNamespaces(persona.id, 1, prefix);
      const expected = events.filter(
        (e) => e.userId === persona.id && e.namespace === ns.facts && e.status === "done",
      ).length;
      const started = Date.now();
      for (;;) {
        const hits = await memory
          .recall({ namespace: ns.facts, query: "interview coaching notes", limit: 20 })
          .catch(() => []);
        if (hits.length >= expected || Date.now() - started > 120_000) {
          say(
            `${persona.id}: ${hits.length}/${expected} lines searchable after ${Math.round((Date.now() - started) / 1000)} s`,
          );
          break;
        }
        await sleep(10_000);
      }
    }
  }

  // ---------- Probes: fresh thread per probe, Amnesia vs memory ----------
  for (const persona of PERSONAS) {
    // Withdraw consent: probes recall but never save.
    await db
      .update(schema.userSettings)
      .set({ memoryConsentAt: null })
      .where(eq(schema.userSettings.userId, persona.id));
  }
  for (const persona of PERSONAS) {
    currentUser = persona;
    for (const category of PROBE_CATEGORIES) {
      const fix = fixes.get(persona.id) ?? null;
      const keywords =
        category === "last_assignment"
          ? fix
            ? fixKeywords(fix)
            : []
          : [...persona.expect[category]];
      const minHits = category === "last_assignment" ? FIX_MIN_HITS : 1;
      for (const mode of ["amnesia", "memory"] as const) {
        say(`${persona.id} probe ${category} (${mode})`);
        const session = await sessions.createSession({
          userId: persona.id,
          mode: "free_chat",
          memoryEnabled: mode === "memory",
          title: `Eval probe ${category}`,
        });
        const t = await chat(session.id, PROBE_QUESTIONS[category], []);
        await runAfter(); // recall_events only (consent withdrawn)
        const [event] = await db
          .select()
          .from(schema.recallEvents)
          .where(eq(schema.recallEvents.coachingSessionId, session.id));
        const score = keywords.length > 0 ? scoreReply(t.reply, keywords, minHits) : null;
        results.probes.push({
          persona: persona.id,
          category,
          mode,
          question: PROBE_QUESTIONS[category],
          reply: t.reply,
          error: t.error,
          keywords,
          required: score?.required ?? 0,
          matched: score?.matched ?? [],
          pass: t.error ? false : (score?.pass ?? null),
          recalled: (t.memory?.recalled ?? []).map((c) => ({
            kind: c.kind,
            blobId: c.blobId,
            snippet: c.snippet,
            ...(c.seenInSessions ? { seenInSessions: c.seenInSessions } : {}),
          })),
          degraded: t.memory ? t.memory.degraded : null,
          recallAttempt: event?.attempt ?? null,
          recallLatencyMs: event?.latencyMs ?? null,
          firstTokenMs: t.firstTokenMs,
          totalMs: t.totalMs,
        });
        await sessions.endSession({ id: session.id, userId: persona.id }, new Date());
      }
    }
  }

  // ---------- Save everything ----------
  const meta = {
    runId,
    date: now.toISOString(),
    dryRun: DRY,
    namespacePrefix: prefix,
    chatModel: models.chatModelId,
    extractionModel: models.extractionModelId,
    memwalSdk: installedVersion("@mysten-incubation/memwal"),
    aiSdk: installedVersion("ai"),
    relayer: relayerMeta,
    writesUsed,
    writesRefused,
    writeBudget: WRITE_BUDGET,
    relayerRequestsCounted: window.count,
    relayerPerMinuteCap: RELAYER_PER_MIN,
    personas: PERSONAS.map((p) => p.id),
  };
  const memoryEventsMeta = events.map((e) => ({
    persona: e.userId,
    kind: e.kind,
    status: e.status,
    blobId: e.blobId,
    errorCode: e.errorCode,
    latencyMs: e.latencyMs,
  }));
  await writeFile(path.join(outDir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  await writeFile(
    path.join(outDir, "session1.json"),
    `${JSON.stringify(results.session1, null, 2)}\n`,
  );
  await writeFile(
    path.join(outDir, "memory-events.json"),
    `${JSON.stringify(memoryEventsMeta, null, 2)}\n`,
  );
  await writeFile(path.join(outDir, "probes.json"), `${JSON.stringify(results.probes, null, 2)}\n`);
  await writeFile(
    path.join(outDir, "SUMMARY.md"),
    summarize(meta, results.probes, memoryEventsMeta, saveLatencies),
  );
  say(`done: ${writesUsed} writes, ${window.count} relayer requests counted → ${outDir}`);
  await pg.close();

  function kindCounts(saved: typeof memoryEventsMeta): string {
    const counts = new Map<string, number>();
    for (const s of saved) counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1);
    return [...counts].map(([k, n]) => `${k} ${n}`).join(", ");
  }

  function summarize(
    m: typeof meta,
    probes: ProbeResult[],
    saved: typeof memoryEventsMeta,
    saveMs: number[],
  ): string {
    const cell = (persona: string, category: ProbeCategory, mode: "amnesia" | "memory") => {
      const p = probes.find(
        (x) => x.persona === persona && x.category === category && x.mode === mode,
      );
      if (!p) return "—";
      if (p.error) return "error";
      return p.pass === null ? "n/a" : p.pass ? "✅" : "❌";
    };
    const total = (mode: "amnesia" | "memory") => {
      const scored = probes.filter((p) => p.mode === mode && p.pass !== null);
      return `${scored.filter((p) => p.pass).length}/${scored.length}`;
    };
    const byCategory = PROBE_CATEGORIES.map((c) => {
      const row = (mode: "amnesia" | "memory") => {
        const scored = probes.filter((p) => p.category === c && p.mode === mode && p.pass !== null);
        return `${scored.filter((p) => p.pass).length}/${scored.length}`;
      };
      return `| ${c} | ${row("amnesia")} | ${row("memory")} |`;
    });
    const memoryProbes = probes.filter((p) => p.mode === "memory");
    const recallMs = memoryProbes.flatMap((p) =>
      p.recallLatencyMs === null ? [] : [p.recallLatencyMs],
    );
    const ttft = (mode: "amnesia" | "memory") =>
      median(
        probes
          .filter((p) => p.mode === mode)
          .flatMap((p) => (p.firstTokenMs === null ? [] : [p.firstTokenMs])),
      );
    const retried = memoryProbes.filter((p) => p.recallAttempt === 2).length;
    const degraded = memoryProbes.filter((p) => p.degraded).length;
    return `# Memory eval — ${m.runId}${m.dryRun ? " (DRY RUN — not evidence)" : ""}

Generated by \`pnpm eval:memory\` (scripts/eval-memory.ts). Synthetic personas
(scripts/eval/personas.ts), real chat-service code path, Walrus Memory on
Mainnet in throwaway \`${m.namespacePrefix}-*\` namespaces. Deterministic
keyword scoring; probes and keywords were fixed before the run.

| | |
|---|---|
| Date | ${m.date} |
| Chat model | \`${m.chatModel}\` (extraction: \`${m.extractionModel}\`) |
| Walrus Memory SDK | \`@mysten-incubation/memwal\` ${m.memwalSdk} |
| Relayer | ${m.relayer.relayerVersion ?? "?"} (API ${m.relayer.apiVersion ?? "?"}, build ${m.relayer.build ?? "?"}) |
| AI SDK | \`ai\` ${m.aiSdk} |
| Walrus writes | ${m.writesUsed} used of ${m.writeBudget}${m.writesRefused ? `, ${m.writesRefused} refused by the cap` : ""} |
| Relayer requests (counted) | ${m.relayerRequestsCounted} (cap ${m.relayerPerMinuteCap}/min) |

## Score: Amnesia Mode vs memory on

**Amnesia ${total("amnesia")} · Memory ${total("memory")}** (probes passed; n/a = no expected keywords, e.g. no fix in session 1)

| Persona | ${PROBE_CATEGORIES.map((c) => `${c} (A → M)`).join(" | ")} |
|---|${PROBE_CATEGORIES.map(() => "---").join("|")}|
${PERSONAS.map((p) => `| ${p.id} | ${PROBE_CATEGORIES.map((c) => `${cell(p.id, c, "amnesia")} → ${cell(p.id, c, "memory")}`).join(" | ")} |`).join("\n")}

| Category | Amnesia | Memory |
|---|---|---|
${byCategory.join("\n")}

## Session 1 saves

${saved.length} memory jobs: ${saved.filter((s) => s.status === "done").length} done, ${saved.filter((s) => s.status === "failed").length} failed, ${saved.filter((s) => s.status === "pending").length} pending.
Kinds: ${kindCounts(saved)}.

## Latency (medians)

| | ms |
|---|---|
| Save (remember → done, per job) | ${median(saveMs) ?? "—"} |
| Recall per memory-on turn (all queries, parallel) | ${median(recallMs) ?? "—"} |
| First token, memory on | ${ttft("memory") ?? "—"} |
| First token, Amnesia | ${ttft("amnesia") ?? "—"} |

Recall retried once on ${retried} of ${memoryProbes.length} memory-on probes; degraded on ${degraded}.

Raw data: \`meta.json\`, \`session1.json\` (scripted turns + coach replies),
\`memory-events.json\` (metadata only), \`probes.json\` (every reply, matched
keywords, recalled chips).
`;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
