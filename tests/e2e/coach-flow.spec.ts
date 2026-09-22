import { expect, expectAccessible, openWidget, signIn, test } from "./fixtures";

test.describe("landing page", () => {
  test("renders the hero and is accessible (light + dark)", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: /interview coach that remembers/i }),
    ).toBeVisible();
    await expectAccessible(page, "landing light");
    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    await expectAccessible(page, "landing dark");
  });

  test("health endpoint reports db, relayer and model without secrets", async ({ request }) => {
    const res = await request.get("/api/health");
    const body = await res.json();
    expect(body).toMatchObject({ db: "ok", relayer: "ok" });
    expect(JSON.stringify(body)).not.toMatch(/gsk_|suiprivkey|postgres:\/\//);
  });
});

test.describe("widget: keyboard + signed out", () => {
  test("Ctrl+K opens, Esc closes and returns focus to the launcher", async ({ page }) => {
    await page.goto("/");
    const launcher = page.getByRole("button", { name: /Open interview coach/ });
    await launcher.focus();
    await page.keyboard.press("Control+k");
    const dialog = page.getByRole("dialog", { name: /Recall/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: /Recall/ })).toBeFocused();
    await expect(dialog.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await expectAccessible(page, "widget signed out", '[role="dialog"]');
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: /Open interview coach/ })).toBeFocused();
  });

  test("protected routes: API 401 JSON, /coach redirects", async ({ page, request }) => {
    const res = await request.post("/api/chat", { data: {} });
    expect(res.status()).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    await page.goto("/coach");
    await expect(page).toHaveURL(/\/($|\?)/);
    await expect(page.getByRole("dialog", { name: /Recall/ })).toBeVisible();
  });
});

test.describe("full coaching flow", () => {
  test("onboarding → mock interview → inspector → summary, accessible at each step", async ({
    page,
    context,
    baseURL,
  }) => {
    await signIn(context, baseURL ?? "", { name: "Ada Tester" });
    await page.goto("/");
    await openWidget(page);
    const dialog = page.getByRole("dialog", { name: /Recall/ });

    // Step 1 — validation, then fill.
    await expect(
      dialog.getByRole("heading", { name: "What are you preparing for?" }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Continue" }).click();
    await expect(dialog.getByText("Required")).toBeVisible();
    await expectAccessible(page, "onboarding step 1 (errors)", '[role="dialog"]');
    await dialog.getByLabel("Target role").fill("Backend engineer");
    await dialog.getByLabel(/Company/).fill("Stripe");
    await dialog.getByRole("radio", { name: "Mid-level" }).check();
    await dialog.getByRole("button", { name: "Continue" }).click();

    // Step 2
    await expect(
      dialog.getByRole("heading", { name: "When, and what to focus on?" }),
    ).toBeFocused();
    await dialog.getByLabel(/Focus areas/).fill("System design failure modes");
    await dialog.getByLabel(/Focus areas/).press("Enter");
    await expect(dialog.getByRole("list", { name: "Chosen focus areas" })).toContainText(
      "System design failure modes",
    );
    await dialog.getByRole("button", { name: "Continue" }).click();

    // Step 3 — consent is required.
    await dialog.getByRole("radio", { name: /Examples first/ }).check();
    await dialog.getByRole("radio", { name: "Concise" }).check();
    await dialog.getByRole("button", { name: "Save and start" }).click();
    await expect(dialog.getByText("Please confirm to continue.")).toBeVisible();
    await dialog.getByRole("checkbox", { name: /agree to store coaching memories/ }).check();
    await expectAccessible(page, "onboarding step 3", '[role="dialog"]');
    await dialog.getByRole("button", { name: "Save and start" }).click();

    // Home
    await expect(dialog.getByRole("heading", { name: /Ada\./ })).toBeVisible();
    await expectAccessible(page, "home", '[role="dialog"]');

    // Chat
    await dialog.getByRole("button", { name: /Mock interview/ }).click();
    await expect(dialog.getByText("Ready when you are.")).toBeVisible();
    await dialog
      .getByRole("textbox", { name: "Message the coach" })
      .fill("Let's practice. What should I work on?");
    await page.keyboard.press("Enter");
    await expect(dialog.getByText(/Tell me about a time you missed a deadline/)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Send message" })).toBeVisible();
    await expect(page.locator('[aria-live="polite"][aria-atomic="true"]')).toContainText(
      "Coach replied",
    );
    await expectAccessible(page, "chat", '[role="dialog"]');

    // Inspector
    await dialog.getByRole("button", { name: "What I remember" }).click();
    const sheet = page.getByRole("dialog", { name: "What I remember" });
    await expect(sheet.getByText(/memories saved on Walrus/)).toBeVisible();
    await expect(sheet.getByText("Backend engineer at Stripe")).toBeVisible();
    await expectAccessible(page, "inspector", '[data-slot="sheet-content"]');
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(dialog).toBeVisible();

    // Summary
    await dialog.getByRole("button", { name: "End session" }).click();
    await expect(dialog.getByRole("heading", { name: "Session complete" })).toBeVisible();
    await expect(dialog.getByText(/Saved to Walrus/)).toBeVisible({ timeout: 30_000 });
    await expectAccessible(page, "summary", '[role="dialog"]');
  });

  test("a second session recalls memories from the first (chips before the reply)", async ({
    page,
    context,
    baseURL,
  }) => {
    await signIn(context, baseURL ?? "", { onboarded: true, name: "Grace Tester" });
    await page.goto("/");
    await openWidget(page);
    const dialog = page.getByRole("dialog", { name: /Recall/ });

    await dialog.getByRole("button", { name: /Drill a weak spot/ }).click();
    await dialog
      .getByRole("textbox", { name: "Message the coach" })
      .fill("I want to practise STAR answers with a measurable result");
    await page.keyboard.press("Enter");
    await expect(dialog.getByRole("button", { name: "Send message" })).toBeVisible();
    await dialog.getByRole("button", { name: "End session" }).click();
    await expect(dialog.getByText(/Saved to Walrus: .*1 saved/)).toBeVisible({ timeout: 30_000 });

    await dialog.getByRole("button", { name: "Start another session" }).click();
    await dialog.getByRole("button", { name: /Mock interview/ }).click();
    await dialog
      .getByRole("textbox", { name: "Message the coach" })
      .fill("practise STAR answers measurable results");
    await page.keyboard.press("Enter");
    const chips = dialog.getByRole("button", { name: /Recalled \d+ memor/ });
    await expect(chips).toBeVisible();
    await chips.click();
    await expect(dialog.getByText(/STAR answers with measurable results/)).toBeVisible();
    await expect(
      dialog.getByRole("link", { name: /View blob on Walruscan/ }).first(),
    ).toBeVisible();
  });

  test("Amnesia Mode shows the banner and recalls nothing", async ({ page, context, baseURL }) => {
    await signIn(context, baseURL ?? "", { onboarded: true });
    await page.goto("/");
    await openWidget(page);
    const dialog = page.getByRole("dialog", { name: /Recall/ });
    await dialog.getByRole("switch", { name: /Start without memory/ }).click();
    await dialog.getByRole("button", { name: /Just chat/ }).click();
    await expect(dialog.getByText("Amnesia Mode: nothing is recalled or saved.")).toBeVisible();
    await expect(dialog.getByText("Amnesia Mode", { exact: true })).toBeVisible();
    await dialog.getByRole("textbox", { name: "Message the coach" }).fill("hello coach");
    await page.keyboard.press("Enter");
    await expect(dialog.getByRole("button", { name: "Send message" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Recalled/ })).toHaveCount(0);
  });

  test("/coach full page works for signed-in users", async ({ page, context, baseURL }) => {
    await signIn(context, baseURL ?? "", { onboarded: true });
    await page.goto("/coach");
    await expect(page.getByRole("region", { name: /Recall/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Start a session/ })).toBeVisible();
    await expectAccessible(page, "coach page");
  });

  test("non-admins get 403 on the evidence API and page", async ({ page, context, baseURL }) => {
    await signIn(context, baseURL ?? "", { onboarded: true });
    const res = await page.request.get("/api/admin/evidence");
    expect(res.status()).toBe(403);
    await page.goto("/admin/evidence");
    await expect(page.getByRole("heading", { name: "This page is for admins only" })).toBeVisible();
  });
});
