import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";
import { clientSchema, crossFieldProblems, serverSchema } from "./lib/env-schemas";

/**
 * Validated environment. Imported by next.config.ts so `next build` and
 * `next dev` fail fast with a readable list of problems.
 *
 * SKIP_ENV_VALIDATION=1 is honoured only for tooling that never talks to
 * real services (lint, unit tests, CI builds without secrets).
 */
export const env = createEnv({
  server: serverSchema,
  client: clientSchema,
  experimental__runtimeEnv: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_WALRUS_EXPLORER_BLOB_URL: process.env.NEXT_PUBLIC_WALRUS_EXPLORER_BLOB_URL,
    NEXT_PUBLIC_SUI_EXPLORER_OBJECT_URL: process.env.NEXT_PUBLIC_SUI_EXPLORER_OBJECT_URL,
  },
  emptyStringAsUndefined: true,
  skipValidation: process.env.SKIP_ENV_VALIDATION === "1",
  createFinalSchema: (shape, isServer) =>
    z.object(shape).superRefine((value, ctx) => {
      if (!isServer) return;
      for (const message of crossFieldProblems(value)) {
        ctx.addIssue({ code: "custom", message });
      }
    }),
  onValidationError: (issues) => {
    const lines = issues.map((issue) => {
      const path = issue.path
        ?.map((p) => (typeof p === "object" ? String(p.key) : String(p)))
        .join(".");
      return `  • ${path ? `${path}: ` : ""}${issue.message}`;
    });
    throw new Error(`❌ Invalid environment variables:\n${lines.join("\n")}\nSee .env.example.`);
  },
});
