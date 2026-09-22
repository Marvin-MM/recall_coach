/**
 * pnpm memwal:verify — end-to-end check of the Walrus Memory setup (Mainnet):
 * relayer health + compatibility, delegate key → public key / Sui address,
 * account id, and one remember→recall round trip in a throwaway namespace.
 * Exits non-zero on any failure. Never prints secrets.
 */
import "./load-env";
import { delegateKeyToSuiAddress, MemWal } from "@mysten-incubation/memwal";
import { installedVersion } from "./sdk-info";

async function main(): Promise<void> {
  const { env } = await import("../src/env");
  const { siteConfig } = await import("../src/config/site");
  const ok = (label: string, value: unknown) => console.log(`✔ ${label}: ${String(value)}`);

  console.log(`Walrus Memory verification for ${siteConfig.name}\n`);
  ok("SDK version", installedVersion("@mysten-incubation/memwal"));
  ok("Relayer", env.MEMWAL_SERVER_URL);

  const memwal = MemWal.create({
    key: env.MEMWAL_PRIVATE_KEY,
    accountId: env.MEMWAL_ACCOUNT_ID,
    serverUrl: env.MEMWAL_SERVER_URL,
  });

  const health = await memwal.health();
  if (health.status !== "ok") throw new Error(`relayer health: ${health.status}`);
  ok(
    "Health",
    `${health.status} (relayer ${health.relayerVersion ?? health.version}, mode ${health.mode ?? "?"}, write_ready ${String(health.write_ready)})`,
  );

  const compat = await memwal.compatibility();
  ok("Compatibility", `API ${compat.apiVersion}, min TS SDK ${compat.minSupportedSdk.typescript}`);
  if (compat.deprecations.length > 0) {
    console.log(`  ! ${compat.deprecations.length} relayer deprecation notice(s):`);
    for (const d of compat.deprecations) console.log(`    - ${d.surface}: ${d.guidance}`);
  }

  ok("Account ID (MemWalAccount object)", env.MEMWAL_ACCOUNT_ID);
  ok("Delegate public key", await memwal.getPublicKeyHex());
  ok("Delegate Sui address", await delegateKeyToSuiAddress(env.MEMWAL_PRIVATE_KEY));
  ok("Account on explorer", `${env.NEXT_PUBLIC_SUI_EXPLORER_OBJECT_URL}${env.MEMWAL_ACCOUNT_ID}`);

  const namespace = `${env.MEMWAL_NAMESPACE_PREFIX}-verify-${Date.now()}`;
  const marker = `verify-${Math.random().toString(36).slice(2, 10)}`;
  const text = `[kind=goal][at=${new Date().toISOString()}] Verification memory ${marker}: the user is preparing for a backend interview.`;
  console.log(`\nRound trip in throwaway namespace ${namespace} …`);
  const t0 = Date.now();
  const saved = await memwal.rememberAndWait(text, namespace, { timeoutMs: 90_000 });
  ok("rememberAndWait", `blob ${saved.blob_id} in ${Date.now() - t0} ms`);
  ok("Blob on Walruscan", `${env.NEXT_PUBLIC_WALRUS_EXPLORER_BLOB_URL}${saved.blob_id}`);

  // The job reports `done` before the vector index is queryable, so poll:
  // this also measures the remember→recall visibility window.
  const t1 = Date.now();
  let hit: { blob_id: string; distance: number } | undefined;
  let attempts = 0;
  while (!hit && Date.now() - t1 < 60_000) {
    attempts++;
    const recalled = await memwal.recall({
      query: "backend interview preparation",
      namespace,
      limit: 3,
    });
    hit = recalled.results.find((r) => r.text.includes(marker));
    if (!hit) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!hit)
    throw new Error("recall did not return the stored memory within 60 s of job completion");
  ok(
    "recall",
    `found blob ${hit.blob_id} at distance ${hit.distance.toFixed(3)}; visible ${Date.now() - t1} ms after done (${attempts} attempt${attempts === 1 ? "" : "s"})`,
  );
  if (hit.blob_id !== saved.blob_id) console.log(`  ! recalled blob id differs from saved blob id`);

  memwal.destroy();
  console.log("\nAll checks passed.");
}

main().catch((error: unknown) => {
  const e = error as { message?: string; status?: number; serverCode?: string };
  console.error(
    `\n✖ memwal:verify failed: ${e.message ?? String(error)}${e.status ? ` (HTTP ${e.status})` : ""}${e.serverCode ? ` [${e.serverCode}]` : ""}`,
  );
  process.exit(1);
});
