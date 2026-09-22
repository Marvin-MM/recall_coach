/**
 * pnpm evidence:export [--include-text] — admin export of evidence metadata.
 *
 * Default (redacted): memory_events + recall_events metadata with users
 * pseudonymized (user-1, user-2 …) → docs/evidence/export-<date>/*.json.
 *
 * --include-text: additionally live-recalls memory TEXT from Walrus for users
 * who gave memory consent. Only use this with each user's written OK, and
 * never commit that output without it — the folder is created with a README
 * warning and `text-*.json` files are .gitignored.
 */
import "./load-env";
import { mkdirSync, writeFileSync } from "node:fs";
import { asc, isNotNull } from "drizzle-orm";

async function main(): Promise<void> {
  const includeText = process.argv.includes("--include-text");
  const { env } = await import("../src/env");
  const { getDb, closeDb } = await import("../src/server/db/client");
  const schema = await import("../src/server/db/schema");
  const { deriveNamespaces } = await import("../src/server/memory/namespace");
  const { getMemoryPort } = await import("../src/server/memory/provider");
  const { RECALL_QUERIES } = await import("../src/config/coach");

  const db = getDb();
  const users = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .orderBy(asc(schema.user.createdAt), asc(schema.user.id));
  const pseudo = new Map(users.map((u, i) => [u.id, `user-${i + 1}`]));
  const p = (id: string) => pseudo.get(id) ?? "user-unknown";

  const memoryEvents = (
    await db.select().from(schema.memoryEvents).orderBy(asc(schema.memoryEvents.createdAt))
  ).map((r) => ({
    user: p(r.userId),
    sessionId: r.coachingSessionId,
    kind: r.kind,
    status: r.status,
    jobId: r.jobId,
    blobId: r.blobId,
    explorerUrl: r.blobId ? `${env.NEXT_PUBLIC_WALRUS_EXPLORER_BLOB_URL}${r.blobId}` : null,
    errorCode: r.errorCode,
    latencyMs: r.latencyMs,
    createdAt: r.createdAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
  }));
  const recallEvents = (
    await db.select().from(schema.recallEvents).orderBy(asc(schema.recallEvents.createdAt))
  ).map((r) => ({
    user: p(r.userId),
    sessionId: r.coachingSessionId,
    recalledBlobIds: r.recalledBlobIds,
    resultCount: r.resultCount,
    bestDistance: r.bestDistance,
    latencyMs: r.latencyMs,
    degraded: r.degraded,
    degradedReason: r.degradedReason,
    createdAt: r.createdAt.toISOString(),
  }));

  const date = new Date().toISOString().slice(0, 10);
  const dir = `docs/evidence/export-${date}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/memory-events.json`, `${JSON.stringify(memoryEvents, null, 2)}\n`);
  writeFileSync(`${dir}/recall-events.json`, `${JSON.stringify(recallEvents, null, 2)}\n`);
  console.log(
    `Wrote ${memoryEvents.length} memory events and ${recallEvents.length} recall events to ${dir}/ (redacted).`,
  );

  if (includeText) {
    console.warn(
      "\n⚠ --include-text: exporting live-recalled memory TEXT for consenting users.\n  Do not commit or publish text-*.json without each user's written permission.\n",
    );
    const consenting = await db
      .select({ userId: schema.userSettings.userId, version: schema.userSettings.namespaceVersion })
      .from(schema.userSettings)
      .where(isNotNull(schema.userSettings.memoryConsentAt));
    const memory = getMemoryPort();
    for (const c of consenting) {
      const ns = deriveNamespaces(c.userId, c.version, env.MEMWAL_NAMESPACE_PREFIX);
      const seen = new Map<string, { blobId: string; text: string }>();
      for (const [namespace, query] of [
        ...RECALL_QUERIES.inspector.map((q) => [ns.facts, q] as const),
        [ns.profile, RECALL_QUERIES.profile] as const,
      ]) {
        try {
          for (const m of await memory.recall({ namespace, query, limit: 20 })) {
            seen.set(m.blobId, { blobId: m.blobId, text: m.text });
          }
        } catch (e) {
          console.warn(`recall failed for ${p(c.userId)}: ${(e as Error).message}`);
        }
      }
      writeFileSync(
        `${dir}/text-${p(c.userId)}.json`,
        `${JSON.stringify([...seen.values()], null, 2)}\n`,
      );
      console.log(`  ${p(c.userId)}: ${seen.size} memories`);
    }
    writeFileSync(
      `${dir}/README.md`,
      "text-*.json contain real memory text recalled from Walrus. Share or commit ONLY with each user's written permission.\n",
    );
  }
  await closeDb();
}

main().catch((error: unknown) => {
  console.error(`evidence:export failed: ${(error as Error).message}`);
  process.exit(1);
});
