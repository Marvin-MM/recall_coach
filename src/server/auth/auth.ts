import "server-only";
import { type BetterAuthPlugin, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { testUtils } from "better-auth/plugins";
import { siteConfig } from "@/config/site";
import { env } from "@/env";
import { log } from "@/lib/log";
import { getDb } from "@/server/db/client";
import { createUserSettingsRepo } from "@/server/db/repositories/user-settings.repo";
import { account, session, user, verification } from "@/server/db/schema";

const THIRTY_DAYS = 60 * 60 * 24 * 30;
const ONE_DAY = 60 * 60 * 24;
const isProduction = process.env.NODE_ENV === "production";

/**
 * The E2E sign-in helper exists only outside production AND only when an
 * E2E secret is configured. `process.env.NODE_ENV` is inlined at build time,
 * so production bundles drop this branch entirely.
 */
export const e2eAuthEnabled = !isProduction && Boolean(env.E2E_AUTH_SECRET);

// better-auth 1.7.5: testUtils() declares `init()` returning `options: … | undefined`,
// which does not satisfy BetterAuthPlugin under `exactOptionalPropertyTypes`
// (upstream .d.ts issue, logged in docs/SDK_NOTES.md). Runtime shape is valid.
const e2ePlugins: BetterAuthPlugin[] = e2eAuthEnabled
  ? [testUtils() as unknown as BetterAuthPlugin]
  : [];

export const auth = betterAuth({
  appName: siteConfig.name,
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [...new Set([env.BETTER_AUTH_URL, env.NEXT_PUBLIC_APP_URL])],
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema: { user, session, account, verification },
    transaction: true,
  }),
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      // Least privilege: identity only.
      disableDefaultScope: true,
      scope: ["openid", "email", "profile"],
      prompt: "select_account",
    },
  },
  session: {
    expiresIn: THIRTY_DAYS,
    // Rolling refresh: extend the session at most once a day while in use.
    updateAge: ONE_DAY,
  },
  advanced: {
    cookiePrefix: siteConfig.authCookiePrefix,
    // Better Auth adds the `__Secure-` prefix whenever secure cookies are on.
    useSecureCookies: isProduction,
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      path: "/",
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (created) => {
          try {
            await createUserSettingsRepo(getDb()).ensure(created.id);
          } catch (error) {
            // Session creation also ensures settings, so this is recoverable.
            log.error("auth.user_settings_create_failed", { userId: created.id, error });
          }
        },
      },
    },
  },
  // nextCookies must be the last plugin.
  plugins: [...e2ePlugins, nextCookies()],
});

export type Auth = typeof auth;
