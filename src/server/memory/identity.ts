import "server-only";
import { delegateKeyToPublicKey, delegateKeyToSuiAddress } from "@mysten-incubation/memwal";
import { env } from "@/env";
import type { EvidenceIdentity } from "@/server/api/evidence";
import { bytesToHexCompat } from "./hex";

let cached: Promise<EvidenceIdentity> | undefined;

/**
 * Public identifiers for the submission form / evidence page. The delegate
 * PUBLIC key and its Sui address are derived locally; the private key never
 * leaves this process.
 */
export function memwalIdentity(): Promise<EvidenceIdentity> {
  cached ??= (async () => ({
    accountId: env.MEMWAL_ACCOUNT_ID,
    delegatePublicKey: bytesToHexCompat(await delegateKeyToPublicKey(env.MEMWAL_PRIVATE_KEY)),
    delegateSuiAddress: await delegateKeyToSuiAddress(env.MEMWAL_PRIVATE_KEY),
    relayer: env.MEMWAL_SERVER_URL,
    namespacePrefix: env.MEMWAL_NAMESPACE_PREFIX,
  }))();
  return cached;
}
