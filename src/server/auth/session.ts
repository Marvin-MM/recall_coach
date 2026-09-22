import "server-only";
import { headers as nextHeaders } from "next/headers";
import { UnauthorizedError } from "@/lib/errors";
import { log } from "@/lib/log";
import { isDbUnavailable, toServiceUnavailable } from "@/server/db/client";
import { auth } from "./auth";

export interface AuthUser {
  /** Better Auth internal user id — stable; the ONLY input to namespace derivation. */
  id: string;
  email: string;
  name: string;
  image: string | null;
}

export type UserResolver = (request?: Request) => Promise<AuthUser>;
export type OptionalUserResolver = (request?: Request) => Promise<AuthUser | null>;

/**
 * Resolve the signed-in user from the request cookies (route handlers pass
 * `request`; server components rely on `next/headers`). Returns null when
 * signed out. A database outage surfaces as 503, never as "signed out".
 */
export const getOptionalUser: OptionalUserResolver = async (request) => {
  const headers = request ? request.headers : await nextHeaders();
  try {
    const result = await auth.api.getSession({ headers });
    if (!result) return null;
    const { user } = result;
    return { id: user.id, email: user.email, name: user.name, image: user.image ?? null };
  } catch (error) {
    if (isDbUnavailable(error)) throw toServiceUnavailable(error);
    log.warn("auth.get_session_failed", { error });
    return null;
  }
};

/** Throws UnauthorizedError (→ 401 JSON) when there is no valid session. */
export const requireUser: UserResolver = async (request) => {
  const user = await getOptionalUser(request);
  if (!user) throw new UnauthorizedError();
  return user;
};
