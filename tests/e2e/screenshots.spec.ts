import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

/**
 * HUMAN-RUN screenshot capture for the article (docs/article/screens/).
 * Uses a REAL, consenting tester's signed-in session against a real
 * deployment — never fabricated data. Skipped unless configured:
 *
 *   E2E_BASE_URL=https://<your-domain> \
 *   RECALL_SESSION_COOKIE="__Secure-recall.session_token=<value>" \
 *   pnpm exec playwright test --project=screenshots
 *
 * Copy the cookie from the tester's browser devtools (Application → Cookies)
 * with their permission, and delete it from your shell history afterwards.
 */
const cookie = process.env.RECALL_SESSION_COOKIE;
const OUT = "docs/article/screens";

test.skip(
  !cookie || !process.env.E2E_BASE_URL,
  "Set E2E_BASE_URL and RECALL_SESSION_COOKIE to capture real screenshots.",
);

test("capture onboarding, memory chips, inspector and saving summary", async ({
  page,
  context,
  baseURL,
}) => {
  mkdirSync(OUT, { recursive: true });
  const [name, ...rest] = (cookie ?? "").split("=");
  await context.addCookies([
    {
      name: name ?? "",
      value: rest.join("="),
      domain: new URL(baseURL ?? "").hostname,
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto("/coach");
  const panel = page.getByRole("region", { name: /Callback/ });
  await expect(panel).toBeVisible();

  if (await panel.getByRole("heading", { name: "What are you preparing for?" }).isVisible()) {
    await page.screenshot({ path: `${OUT}/01-onboarding.png` });
    test.info().annotations.push({
      type: "note",
      description: "Tester is not onboarded yet — finish onboarding manually, then re-run.",
    });
    return;
  }

  await panel.getByRole("button", { name: /Mock interview/ }).click();
  await panel
    .getByRole("textbox", { name: "Message the coach" })
    .fill("Let's practice. What should I work on?");
  await page.keyboard.press("Enter");
  await expect(panel.getByRole("button", { name: "Send message" })).toBeVisible({
    timeout: 60_000,
  });
  const chips = panel.getByRole("button", { name: /Recalled \d+ memor/ });
  if (await chips.count()) await chips.first().click();
  await page.screenshot({ path: `${OUT}/02-memory-chips.png` });

  await panel.getByRole("button", { name: "What I remember" }).click();
  await expect(page.getByText(/memories saved on Walrus/)).toBeVisible({ timeout: 45_000 });
  await page.screenshot({ path: `${OUT}/03-inspector.png` });
  await page.keyboard.press("Escape");

  await panel.getByRole("button", { name: "End session" }).click();
  await expect(panel.getByRole("heading", { name: "Session complete" })).toBeVisible();
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${OUT}/04-saving-summary.png` });
});
