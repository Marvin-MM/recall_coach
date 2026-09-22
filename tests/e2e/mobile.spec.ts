import { expect, expectAccessible, signIn, test } from "./fixtures";

test("mobile: launcher opens a full-height drawer and the landing page is accessible", async ({
  page,
  context,
  baseURL,
}) => {
  await signIn(context, baseURL ?? "", { onboarded: true });
  await page.goto("/");
  await expectAccessible(page, "landing mobile");
  await page.getByRole("button", { name: /Open interview coach/ }).click();
  const drawer = page.getByRole("dialog", { name: "Interview coach" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("heading", { name: /Start a session/ })).toBeVisible();
  // No horizontal overflow at phone width.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
