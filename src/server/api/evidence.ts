import { ForbiddenError } from "@/lib/errors";
import type { UserResolver } from "@/server/auth/session";
import type { EvidenceRepo, UserEvidenceRow } from "@/server/db/repositories/evidence.repo";
import { errorResponse, jsonOk } from "@/server/http/respond";
import type { EvidenceDto } from "@/types/api";

export interface EvidenceIdentity {
  accountId: string;
  delegatePublicKey: string;
  delegateSuiAddress: string;
  relayer: string;
  namespacePrefix: string;
}

export interface EvidenceDeps {
  requireUser: UserResolver;
  evidence: EvidenceRepo;
  adminEmails: readonly string[];
  identity: () => Promise<EvidenceIdentity>;
}

export const SUBMISSION_MIN_USERS = 3;
export const SUBMISSION_MIN_BLOBS = 10;

/** Pseudonymized, metadata-only evidence (shared by the admin page, API and scripts). */
export function buildEvidence(
  rows: readonly UserEvidenceRow[],
  identity: EvidenceIdentity,
): EvidenceDto {
  const users = rows.map((r, i) => ({
    pseudonym: `user-${i + 1}`,
    doneByKind: r.doneByKind,
    doneTotal: r.doneTotal,
    failedTotal: r.failedTotal,
    pendingTotal: r.pendingTotal,
    sessions: r.sessions,
    recallHitRate: r.recalls > 0 ? Math.round((r.recallHits / r.recalls) * 1000) / 1000 : null,
    firstActivity: r.firstActivity?.toISOString() ?? null,
    lastActivity: r.lastActivity?.toISOString() ?? null,
  }));
  const usersWith10Plus = users.filter((u) => u.doneTotal >= SUBMISSION_MIN_BLOBS).length;
  return {
    generatedAt: new Date().toISOString(),
    ...identity,
    users,
    totals: {
      users: users.length,
      doneBlobs: users.reduce((n, u) => n + u.doneTotal, 0),
      sessions: users.reduce((n, u) => n + u.sessions, 0),
      usersWith10Plus,
      meetsThreshold: usersWith10Plus >= SUBMISSION_MIN_USERS,
    },
  };
}

export async function loadEvidence(
  deps: Pick<EvidenceDeps, "evidence" | "identity">,
): Promise<EvidenceDto> {
  const [rows, identity] = await Promise.all([deps.evidence.perUser(), deps.identity()]);
  return buildEvidence(rows, identity);
}

export function createEvidenceHandler(deps: EvidenceDeps) {
  return async function evidence(request: Request): Promise<Response> {
    try {
      const user = await deps.requireUser(request);
      if (!deps.adminEmails.includes(user.email.toLowerCase())) throw new ForbiddenError();
      return jsonOk(await loadEvidence(deps));
    } catch (error) {
      return errorResponse(error, { route: "admin.evidence" });
    }
  };
}
