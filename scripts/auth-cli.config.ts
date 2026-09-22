/**
 * Schema-only Better Auth config for `pnpm auth:generate`.
 *
 * The runtime instance (src/server/auth/auth.ts) imports `server-only` and the
 * validated env, which the CLI cannot load. This mirrors every option that
 * affects the database schema (providers + plugins). Our plugins (nextCookies,
 * test-only testUtils) add no tables or fields; keep this file in sync if a
 * schema-affecting plugin is ever added.
 */
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  secret: "schema-generation-only-not-a-real-secret-0000000000",
  socialProviders: { google: { clientId: "schema-only", clientSecret: "schema-only" } },
});
