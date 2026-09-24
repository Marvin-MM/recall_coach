/**
 * pnpm memwal:stats [--restore] [--blob-links] — usage evidence from Postgres
 * metadata, cross-checked against Walrus Memory.
 *
 * - Per user (pseudonymized user-1, user-2 … in sign-up order): done blobs by
 *   kind, total, sessions; flags whether ≥3 users have ≥10 done blobs.
 * - Recall quality over memory-on turns: hit rate (≥1 memory recalled, not
 *   degraded), degraded share, median and p95 recall latency.
 * - `--blob-links` prints explorer links for the 2 most recent done blobs to
 *   the console only (never to the stats file).
 * - On-chain cross-check per namespace via `listNamespaces()` (read-only
 *   metadata: memory_count). With `--restore`, also calls `restore(ns, 1)` and
 *   reports its `total` (on-chain blobs the relayer sees). NOTE: restore is not
 *   purely read-only — it re-indexes up to `limit` missing entries.
 * - Writes docs/evidence/stats-<date>.md. Metadata only; no memory text.
 */
import "./load-env";
import { mkdirSync, writeFileSync } from "node:fs";
import { MemWal, type NamespaceSummary } from "@mysten-incubation/memwal";
import { asc, desc, eq } from "drizzle-orm";

async function main(): Promise<void> {
  const withRestore = process.argv.includes("--restore");
  const { env } = await import("../src/env");
  const { getDb, closeDb } = await import("../src/server/db/client");
  const { createEvidenceRepo } = await import("../src/server/db/repositories/evidence.repo");
  const { buildEvidence, SUBMISSION_MIN_BLOBS, SUBMISSION_MIN_USERS } = await import(
    "../src/server/api/evidence"
  );
  const { memwalIdentity } = await import("../src/server/memory/identity");
  const { deriveNamespaces } = await import("../src/server/memory/namespace");
  const schema = await import("../src/server/db/schema");
  const { MEMORY_KINDS } = await import("../src/types/domain");

  const db = getDb();
  const evidenceRepo = createEvidenceRepo(db);
  const rows = await evidenceRepo.perUser();
  const recall = await evidenceRepo.recallSummary();
  const evidence = buildEvidence(rows, await memwalIdentity());
  const settings = await db
    .select({ userId: schema.userSettings.userId, version: schema.userSettings.namespaceVersion })
    .from(schema.userSettings)
    .orderBy(asc(schema.userSettings.userId));
  const versionOf = new Map(settings.map((s) => [s.userId, s.version]));

  // On-chain namespace counts (paginate by has_more).
  const memwal = MemWal.create({
    key: env.MEMWAL_PRIVATE_KEY,
    accountId: env.MEMWAL_ACCOUNT_ID,
    serverUrl: env.MEMWAL_SERVER_URL,
  });
  const namespaces = new Map<string, NamespaceSummary>();
  let cursor: string | undefined;
  for (let page = 0; page < 50; page++) {
    const res = await memwal.listNamespaces(cursor ? { cursor, limit: 100 } : { limit: 100 });
    for (const ns of res.namespaces) namespaces.set(ns.name, ns);
    if (!res.has_more || !res.next_cursor) break;
    cursor = res.next_cursor;
  }

  const lines: string[] = [];
  const now = new Date();
  lines.push(`# Walrus Memory stats — ${now.toISOString()}`, "");
  lines.push(`- Account ID: \`${evidence.accountId}\``);
  lines.push(`- Delegate public key: \`${evidence.delegatePublicKey}\``);
  lines.push(`- Delegate Sui address: \`${evidence.delegateSuiAddress}\``);
  lines.push(
    `- Relayer: ${evidence.relayer}`,
    `- Namespace prefix: \`${evidence.namespacePrefix}\``,
    "",
  );
  lines.push(
    `**Threshold (≥${SUBMISSION_MIN_USERS} users × ≥${SUBMISSION_MIN_BLOBS} done blobs): ${
      evidence.totals.meetsThreshold ? "MET" : "NOT MET"
    }** — ${evidence.totals.usersWith10Plus} user(s) with ≥${SUBMISSION_MIN_BLOBS}; ${evidence.totals.doneBlobs} done blobs total across ${evidence.totals.users} users and ${evidence.totals.sessions} sessions.`,
    "",
  );

  const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "n/a");
  lines.push(
    "## Recall (memory-on turns)",
    "",
    `- Turns with a recall step: ${recall.turns}`,
    `- Recall hit rate (≥1 memory recalled, not degraded): ${pct(recall.hits, recall.turns)} (${recall.hits}/${recall.turns})`,
    `- Degraded recalls (timeout / relayer error / all matches dropped): ${pct(recall.degraded, recall.turns)} (${recall.degraded})`,
    `- Recall latency: median ${recall.medianLatencyMs ?? "n/a"} ms, p95 ${recall.p95LatencyMs ?? "n/a"} ms`,
    "",
    "## Per user",
    "",
  );

  const header = [
    "User",
    "Done",
    ...MEMORY_KINDS,
    "Failed",
    "Pending",
    "Sessions",
    "On-chain (facts+profile)",
  ];
  if (withRestore) header.push("restore().total");
  lines.push(`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`);

  for (const [i, row] of rows.entries()) {
    const u = evidence.users[i];
    if (!u) continue;
    const ns = deriveNamespaces(
      row.userId,
      versionOf.get(row.userId) ?? 1,
      env.MEMWAL_NAMESPACE_PREFIX,
    );
    const onChain =
      (namespaces.get(ns.facts)?.memory_count ?? 0) +
      (namespaces.get(ns.profile)?.memory_count ?? 0);
    const cells = [
      u.pseudonym,
      String(u.doneTotal),
      ...MEMORY_KINDS.map((k) => String(u.doneByKind[k] ?? 0)),
      String(u.failedTotal),
      String(u.pendingTotal),
      String(u.sessions),
      String(onChain),
    ];
    if (withRestore) {
      let total = 0;
      for (const name of [ns.facts, ns.profile]) {
        try {
          total += (await memwal.restore(name, 1)).total;
        } catch (e) {
          console.warn(`restore(${u.pseudonym}) failed: ${(e as Error).message}`);
        }
      }
      cells.push(String(total));
    }
    lines.push(`| ${cells.join(" | ")} |`);
  }
  lines.push(
    "",
    "Notes: \"Done\" counts come from `memory_events` (status = done, blob id recorded). The on-chain column is `memory_count` from the relayer's `listNamespaces()` for the user's facts and profile namespaces. Differences usually mean jobs still pending or rows written by earlier test runs.",
  );

  if (process.argv.includes("--blob-links")) {
    const recent = await db
      .select({ blobId: schema.memoryEvents.blobId })
      .from(schema.memoryEvents)
      .where(eq(schema.memoryEvents.status, "done"))
      .orderBy(desc(schema.memoryEvents.completedAt))
      .limit(2);
    console.log("\nExample blob links (console only; confirm consent before publishing):");
    for (const r of recent) {
      if (r.blobId) console.log(`  ${env.NEXT_PUBLIC_WALRUS_EXPLORER_BLOB_URL}${r.blobId}`);
    }
  }

  const outDir = "docs/evidence";
  mkdirSync(outDir, { recursive: true });
  const file = `${outDir}/stats-${now.toISOString().slice(0, 10)}.md`;
  writeFileSync(file, `${lines.join("\n")}\n`);
  console.log(lines.join("\n"));
  console.log(`\nWrote ${file}`);
  memwal.destroy();
  await closeDb();
}

main().catch((error: unknown) => {
  console.error(`memwal:stats failed: ${(error as Error).message}`);
  process.exit(1);
});
