import "server-only";
import { env } from "@/env";
import { ForbiddenError } from "@/lib/errors";
import type { AuthUser } from "./session";

export function isAdminEmail(
  email: string,
  adminEmails: readonly string[] = env.ADMIN_EMAILS,
): boolean {
  return adminEmails.includes(email.trim().toLowerCase());
}

/** Throws ForbiddenError (→ 403) unless the user's email is in ADMIN_EMAILS. */
export function assertAdmin(
  user: AuthUser,
  adminEmails: readonly string[] = env.ADMIN_EMAILS,
): void {
  if (!isAdminEmail(user.email, adminEmails)) throw new ForbiddenError();
}
