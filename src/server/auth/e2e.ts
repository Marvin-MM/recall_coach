import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { TestCookie, TestHelpers } from "better-auth/plugins";
import { z } from "zod";
import { env } from "@/env";
import { getDb } from "@/server/db/client";
import { createUserSettingsRepo } from "@/server/db/repositories/user-settings.repo";
import { auth, e2eAuthEnabled } from "./auth";

export const e2eSignInSchema = z.object({
  email: z.email().max(200),
  name: z.string().min(1).max(100).default("E2E Tester"),
  onboarded: z.boolean().default(false),
});

function sameSecret(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function isAuthorizedE2eRequest(request: Request): boolean {
  if (!e2eAuthEnabled || !env.E2E_AUTH_SECRET) return false;
  const provided = request.headers.get("x-e2e-secret") ?? "";
  return provided.length > 0 && sameSecret(provided, env.E2E_AUTH_SECRET);
}

/** Create (or reuse) a test user and mint a real Better Auth session for it. */
export async function e2eSignIn(input: z.output<typeof e2eSignInSchema>): Promise<{
  userId: string;
  cookies: TestCookie[];
}> {
  const ctx = await auth.$context;
  const test = (ctx as unknown as { test?: TestHelpers }).test;
  if (!test) throw new Error("testUtils plugin not registered");

  const existing = await ctx.internalAdapter.findUserByEmail(input.email);
  const user =
    existing?.user ??
    (await test.saveUser(
      test.createUser({ email: input.email, name: input.name, emailVerified: true }),
    ));

  const settings = createUserSettingsRepo(getDb());
  await settings.ensure(user.id);
  if (input.onboarded) await settings.completeOnboarding(user.id, new Date());

  const cookies = await test.getCookies({
    userId: user.id,
    domain: new URL(env.BETTER_AUTH_URL).hostname,
  });
  return { userId: user.id, cookies };
}
