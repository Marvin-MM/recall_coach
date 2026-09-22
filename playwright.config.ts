import { readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against `next dev` with the test-only drivers (MEMORY_DRIVER=fake,
 * LLM_DRIVER=fake) and the E2E sign-in route, using `.env.e2e` (never
 * committed; see .env.example). Production builds compile those paths out,
 * so E2E cannot target `next start`.
 */
function loadEnvFile(path: string): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(path, "utf8")
        .split("\n")
        .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
        }),
    );
  } catch {
    return {};
  }
}

const e2eEnv = loadEnvFile(".env.e2e");
const PORT = 3100;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /(screenshots|mobile)\.spec\.ts/,
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      testMatch: /mobile\.spec\.ts/,
    },
    {
      // Human-run only: real signed-in tester, real data (see docs/USER_TEST_GUIDE.md).
      name: "screenshots",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /screenshots\.spec\.ts/,
    },
  ],
  ...(process.env.E2E_BASE_URL
    ? {}
    : {
        webServer: {
          command: `pnpm exec next dev --port ${PORT}`,
          url: `${baseURL}/api/health`,
          timeout: 180_000,
          reuseExistingServer: !process.env.CI,
          env: { ...e2eEnv, NEXT_TELEMETRY_DISABLED: "1" },
        },
      }),
});
