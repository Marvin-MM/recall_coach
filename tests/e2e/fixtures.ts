import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { type BrowserContext, test as base, expect, type Page } from "@playwright/test";

function e2eSecret(): string {
  if (process.env.E2E_AUTH_SECRET) return process.env.E2E_AUTH_SECRET;
  const line = readFileSync(".env.e2e", "utf8")
    .split("\n")
    .find((l) => l.startsWith("E2E_AUTH_SECRET="));
  const secret = line?.slice("E2E_AUTH_SECRET=".length).trim();
  if (!secret) throw new Error("E2E_AUTH_SECRET missing in .env.e2e");
  return secret;
}

/** Create a fresh test user via the test-only route and attach its session cookie. */
export async function signIn(
  context: BrowserContext,
  baseURL: string,
  options: { onboarded?: boolean; name?: string } = {},
): Promise<{ email: string; userId: string }> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`;
  const res = await context.request.post(`${baseURL}/api/test/e2e-sign-in`, {
    headers: { "x-e2e-secret": e2eSecret() },
    data: { email, name: options.name ?? "Ada Tester", onboarded: options.onboarded ?? false },
  });
  expect(res.status(), await res.text()).toBe(200);
  const body = (await res.json()) as {
    userId: string;
    cookies: { name: string; value: string; domain: string; path: string; httpOnly?: boolean }[];
  };
  await context.addCookies(
    body.cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: new URL(baseURL).hostname,
      path: c.path || "/",
      httpOnly: c.httpOnly ?? true,
      sameSite: "Lax" as const,
    })),
  );
  return { email, userId: body.userId };
}

/** Zero serious/critical axe violations (WCAG 2.1 AA), ignoring the Next.js dev overlay. */
export async function expectAccessible(page: Page, label: string, include?: string): Promise<void> {
  let builder = new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude("nextjs-portal");
  if (include) builder = builder.include(include);
  const results = await builder.analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  const summary = blocking.map(
    (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
  );
  expect(summary, `${label}: axe violations`).toEqual([]);
}

export async function openWidget(page: Page): Promise<void> {
  // Wait for hydration so the click reaches React's handler.
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Open interview coach/ }).click();
  await expect(page.getByRole("dialog", { name: /Recall/ })).toBeVisible();
}

export const test = base;
export { expect };
