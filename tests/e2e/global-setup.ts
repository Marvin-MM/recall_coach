import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Apply migrations to the E2E database before the dev server starts. */
export default function globalSetup(): void {
  if (process.env.E2E_BASE_URL) return; // external target: nothing to migrate
  let url = "";
  try {
    const line = readFileSync(".env.e2e", "utf8")
      .split("\n")
      .find((l) => l.startsWith("DATABASE_URL_UNPOOLED="));
    url = line?.slice("DATABASE_URL_UNPOOLED=".length).trim() ?? "";
  } catch {
    throw new Error(
      "Missing .env.e2e — copy .env.example and point it at a throwaway test database.",
    );
  }
  if (!url) throw new Error(".env.e2e must define DATABASE_URL_UNPOOLED");
  execSync("pnpm exec drizzle-kit migrate", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL_UNPOOLED: url },
  });
}
