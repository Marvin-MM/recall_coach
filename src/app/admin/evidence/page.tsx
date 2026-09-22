import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, redirect } from "next/navigation";
import { MEMORY_KIND_LABELS } from "@/config/coach";
import { env } from "@/env";
import { loadEvidence, SUBMISSION_MIN_BLOBS, SUBMISSION_MIN_USERS } from "@/server/api/evidence";
import { isAdminEmail } from "@/server/auth/admin";
import { getOptionalUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { createEvidenceRepo } from "@/server/db/repositories/evidence.repo";
import { memwalIdentity } from "@/server/memory/identity";
import { MEMORY_KINDS } from "@/types/domain";

export const metadata: Metadata = { title: "Evidence", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function EvidencePage() {
  const user = await getOptionalUser();
  if (!user) redirect("/?signin=1&next=/admin/evidence");
  if (!isAdminEmail(user.email)) forbidden();

  const evidence = await loadEvidence({
    evidence: createEvidenceRepo(getDb()),
    identity: memwalIdentity,
  });
  const accountUrl = `${env.NEXT_PUBLIC_SUI_EXPLORER_OBJECT_URL}${evidence.accountId}`;
  const addressUrl = `${env.NEXT_PUBLIC_SUI_EXPLORER_OBJECT_URL.replace(/object\/$/, "account/")}${evidence.delegateSuiAddress}`;

  return (
    <main id="main" className="mx-auto max-w-6xl space-y-10 px-4 py-10 text-sm sm:px-6">
      <header className="space-y-1">
        <Link href="/" className="text-link underline">
          Back to site
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Evidence</h1>
        <p className="text-muted-foreground">
          Metadata only — no memory text. Users are pseudonymized in sign-up order. Generated{" "}
          <span className="font-mono">{evidence.generatedAt}</span>.
        </p>
      </header>

      <section aria-labelledby="ev-identity" className="space-y-3">
        <h2 id="ev-identity" className="text-lg font-medium">
          Walrus Memory identity
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border border-border bg-card p-4">
          <dt className="text-muted-foreground">Account ID</dt>
          <dd className="break-all font-mono">
            <a
              href={accountUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-link underline"
            >
              {evidence.accountId}
            </a>
          </dd>
          <dt className="text-muted-foreground">Delegate public key</dt>
          <dd className="break-all font-mono">{evidence.delegatePublicKey}</dd>
          <dt className="text-muted-foreground">Delegate Sui address</dt>
          <dd className="break-all font-mono">
            <a
              href={addressUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-link underline"
            >
              {evidence.delegateSuiAddress}
            </a>
          </dd>
          <dt className="text-muted-foreground">Relayer</dt>
          <dd className="font-mono">{evidence.relayer}</dd>
          <dt className="text-muted-foreground">Namespace prefix</dt>
          <dd className="font-mono">{evidence.namespacePrefix}</dd>
        </dl>
      </section>

      <section aria-labelledby="ev-totals" className="space-y-3">
        <h2 id="ev-totals" className="text-lg font-medium">
          Totals
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Users", evidence.totals.users],
            ["Saved blobs", evidence.totals.doneBlobs],
            ["Sessions", evidence.totals.sessions],
            [`Users with ≥${SUBMISSION_MIN_BLOBS} blobs`, evidence.totals.usersWith10Plus],
          ].map(([label, value]) => (
            <div key={String(label)} className="border border-border bg-card p-3">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-mono font-tabular text-2xl">{value}</dd>
            </div>
          ))}
        </dl>
        <p className={evidence.totals.meetsThreshold ? "text-link" : "text-muted-foreground"}>
          {evidence.totals.meetsThreshold
            ? `Meets the hackathon threshold (≥${SUBMISSION_MIN_USERS} users with ≥${SUBMISSION_MIN_BLOBS} memories).`
            : `Not yet at the hackathon threshold (≥${SUBMISSION_MIN_USERS} users with ≥${SUBMISSION_MIN_BLOBS} memories).`}
        </p>
      </section>

      <section aria-labelledby="ev-users" className="space-y-3">
        <h2 id="ev-users" className="text-lg font-medium">
          Per user
        </h2>
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="p-2 font-medium">
                  User
                </th>
                <th scope="col" className="p-2 font-medium">
                  Saved
                </th>
                {MEMORY_KINDS.map((k) => (
                  <th key={k} scope="col" className="p-2 font-medium">
                    {MEMORY_KIND_LABELS[k]}
                  </th>
                ))}
                <th scope="col" className="p-2 font-medium">
                  Failed
                </th>
                <th scope="col" className="p-2 font-medium">
                  Sessions
                </th>
                <th scope="col" className="p-2 font-medium">
                  Recall hit rate
                </th>
                <th scope="col" className="p-2 font-medium">
                  First / last activity
                </th>
              </tr>
            </thead>
            <tbody className="font-mono font-tabular text-xs">
              {evidence.users.map((u) => (
                <tr key={u.pseudonym} className="border-t border-border">
                  <th scope="row" className="p-2 font-normal">
                    {u.pseudonym}
                  </th>
                  <td className="p-2">{u.doneTotal}</td>
                  {MEMORY_KINDS.map((k) => (
                    <td key={k} className="p-2">
                      {u.doneByKind[k] ?? 0}
                    </td>
                  ))}
                  <td className="p-2">{u.failedTotal}</td>
                  <td className="p-2">{u.sessions}</td>
                  <td className="p-2">
                    {u.recallHitRate === null ? "–" : `${Math.round(u.recallHitRate * 100)}%`}
                  </td>
                  <td className="p-2">
                    {u.firstActivity?.slice(0, 10) ?? "–"} / {u.lastActivity?.slice(0, 10) ?? "–"}
                  </td>
                </tr>
              ))}
              {evidence.users.length === 0 && (
                <tr>
                  <td
                    colSpan={MEMORY_KINDS.length + 7}
                    className="p-4 text-center font-sans text-muted-foreground"
                  >
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground">
          JSON:{" "}
          <a href="/api/admin/evidence" className="text-link underline">
            /api/admin/evidence
          </a>
        </p>
      </section>
    </main>
  );
}
