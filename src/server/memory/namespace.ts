import { InvalidNamespaceError } from "@/lib/errors";

export interface MemoryNamespaces {
  /** Episodic facts: mistakes, strengths, improvements, goals… */
  facts: string;
  /** Profile snapshots (newest wins). */
  profile: string;
}

const MAX_USER_ID_LENGTH = 64;
const PREFIX_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const USER_ID_PATTERN = /^[a-z0-9-]+$/;

/**
 * Derive a user's memory namespaces from their Better Auth user id.
 *
 * - Input must be the internal user id from the authenticated session (never
 *   email, never client input).
 * - Normalized to lowercase; only [a-z0-9-] allowed. Anything else (path
 *   tricks, wildcards, whitespace, unicode) is REJECTED rather than stripped,
 *   so two different ids can never silently collapse into one namespace.
 *   Better Auth ids are alphanumeric, so real ids always pass.
 * - Pure and deterministic.
 *
 * Case: ids differing only by case would normalize to the same namespace.
 * Better Auth is configured to issue lowercase UUIDs (auth.ts), so real ids
 * cannot collide; `namespace_version` gives a migration path if that changes.
 */
export function deriveNamespaces(
  userId: string,
  version = 1,
  prefix: string = process.env.MEMWAL_NAMESPACE_PREFIX ?? "coach-v1",
): MemoryNamespaces {
  if (!PREFIX_PATTERN.test(prefix)) throw new InvalidNamespaceError("Invalid namespace prefix.");
  if (!Number.isInteger(version) || version < 1 || version > 99) {
    throw new InvalidNamespaceError("Invalid namespace version.");
  }
  if (typeof userId !== "string" || userId.length === 0) {
    throw new InvalidNamespaceError("User id is empty.");
  }
  if (userId.length > MAX_USER_ID_LENGTH) throw new InvalidNamespaceError("User id is too long.");
  const normalized = userId.toLowerCase();
  if (!USER_ID_PATTERN.test(normalized) || normalized.startsWith("-") || normalized.endsWith("-")) {
    throw new InvalidNamespaceError("User id contains unsupported characters.");
  }
  const versionPart = version === 1 ? "" : `-v${version}`;
  const facts = `${prefix}-${normalized}${versionPart}`;
  return { facts, profile: `${facts}-profile` };
}
