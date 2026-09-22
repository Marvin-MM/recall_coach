import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("./src", import.meta.url));
const serverOnlyStub = fileURLToPath(
  new URL("./tests/support/server-only-stub.ts", import.meta.url),
);

const sharedResolve = {
  alias: {
    "@": src,
    "server-only": serverOnlyStub,
  },
};

export default defineConfig({
  plugins: [react()],
  resolve: sharedResolve,
  test: {
    coverage: {
      provider: "v8",
      include: ["src/server/**", "src/lib/**"],
      exclude: ["src/server/db/auth-schema.ts"],
      reporter: ["text-summary", "html"],
      thresholds: {
        "src/server/**": { lines: 80 },
      },
    },
    projects: [
      {
        resolve: sharedResolve,
        plugins: [react()],
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.{ts,tsx}"],
          environment: "node",
          setupFiles: ["tests/support/setup-unit.ts"],
          env: { SKIP_ENV_VALIDATION: "1" },
        },
      },
      {
        resolve: sharedResolve,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          testTimeout: 30_000,
          hookTimeout: 60_000,
          env: { SKIP_ENV_VALIDATION: "1" },
        },
      },
    ],
  },
});
