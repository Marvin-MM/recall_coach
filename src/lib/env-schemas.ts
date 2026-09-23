import { z } from "zod";

/** The only relayer allowed in production unless ALLOW_CUSTOM_RELAYER=true. */
export const MAINNET_RELAYER_URL = "https://relayer.memory.walrus.xyz";

/**
 * Ed25519 delegate key as accepted by MemWal (`MemWalConfig.key`): a 32-byte
 * seed, hex-encoded (64 chars, optional 0x prefix). The SDK also accepts the
 * bech32 `suiprivkey1…` form, but that is what wallets export for *owner*
 * keys, so we reject it to stop the owner key from ever being deployed.
 */
export const delegateKeySchema = z
  .string()
  .trim()
  .refine((v) => !v.toLowerCase().startsWith("suiprivkey"), {
    message:
      "MEMWAL_PRIVATE_KEY looks like a Sui wallet key (suiprivkey…). Use the DELEGATE key hex from the Walrus Memory dashboard, never the owner/wallet key: the owner key controls the account and its funds, a delegate key can only read/write memories and can be revoked.",
  })
  .transform((v) => (v.startsWith("0x") || v.startsWith("0X") ? v.slice(2) : v))
  .refine((v) => /^[0-9a-fA-F]{64}$/.test(v), {
    message: "MEMWAL_PRIVATE_KEY must be a 32-byte Ed25519 seed encoded as 64 hex characters.",
  });

export const accountIdSchema = z
  .string()
  .trim()
  .regex(/^0x[0-9a-fA-F]{1,64}$/, "MEMWAL_ACCOUNT_ID must be a 0x-prefixed Sui object id.");

export const httpsUrlSchema = z
  .url()
  .refine((v) => new URL(v).protocol === "https:", { message: "Must be an https:// URL." });

const FORBIDDEN_MODEL_PATTERNS: ReadonlyArray<(id: string) => boolean> = [
  (id) => id.startsWith("openai/"),
  (id) => id.startsWith("anthropic/"),
  (id) => id.includes("gpt"),
  (id) => id.includes("claude"),
];

/** Project rule: the model must not be an OpenAI or Anthropic model. */
export const groqModelSchema = z
  .string()
  .trim()
  .min(1)
  .refine((v) => !FORBIDDEN_MODEL_PATTERNS.some((test) => test(v.toLowerCase())), {
    message:
      "GROQ_MODEL must not be an OpenAI or Anthropic model (no openai/*, gpt*, claude*). Use e.g. qwen/qwen3.8-27b.",
  });

export const adminEmailsSchema = z
  .string()
  .default("")
  .transform((v) =>
    v
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0),
  )
  .pipe(z.array(z.email()));

export const positiveIntFromString = (fallback: number, max: number) =>
  z.coerce.number().int().positive().max(max).default(fallback);

export const booleanFromString = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((v) => v === "true" || v === "1");

/**
 * Heuristic secret detector for values that end up in the browser bundle.
 * NEXT_PUBLIC_* vars must be plain URLs; these patterns catch the secret
 * shapes this app handles (Groq, Google, Sui/Ed25519, JWT-ish, long base64).
 */
const SECRET_PATTERNS: readonly RegExp[] = [
  /gsk_[A-Za-z0-9]{16,}/,
  /GOCSPX-/,
  /suiprivkey/i,
  /\b[0-9a-fA-F]{64}\b/,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /[A-Za-z0-9+/]{40,}={0,2}/,
];

export function looksLikeSecret(value: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(value));
}

export const publicUrlSchema = z.url().refine((v) => !looksLikeSecret(v), {
  message: "NEXT_PUBLIC_* values are shipped to the browser and must not contain secrets.",
});

/** Explorer prefix: a public URL that must end with "/" so ids can be appended. */
export const explorerPrefixSchema = publicUrlSchema.refine((v) => v.endsWith("/"), {
  message: "Explorer URL prefix must end with '/'.",
});

export const serverSchema = {
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  ADMIN_EMAILS: adminEmailsSchema,

  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET must be ≥32 chars (openssl rand -base64 32)."),
  BETTER_AUTH_URL: z.url(),
  GOOGLE_CLIENT_ID: z.string().min(10),
  GOOGLE_CLIENT_SECRET: z.string().min(10),

  DATABASE_URL: z.url(),
  DATABASE_URL_UNPOOLED: z.url(),
  DATABASE_DRIVER: z.enum(["neon", "pg"]).optional(),

  GROQ_API_KEY: z.string().min(10),
  GROQ_MODEL: groqModelSchema,
  GROQ_EXTRACTION_MODEL: groqModelSchema,

  MEMWAL_PRIVATE_KEY: delegateKeySchema,
  MEMWAL_ACCOUNT_ID: accountIdSchema,
  MEMWAL_SERVER_URL: httpsUrlSchema.default(MAINNET_RELAYER_URL),
  MEMWAL_NAMESPACE_PREFIX: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,31}$/, "MEMWAL_NAMESPACE_PREFIX: lowercase a-z, 0-9, '-' (≤32)."),
  MEMWAL_RECALL_TIMEOUT_MS: positiveIntFromString(3000, 30_000),
  MEMWAL_SAVE_TIMEOUT_MS: positiveIntFromString(20_000, 120_000),
  ALLOW_CUSTOM_RELAYER: booleanFromString,

  UPSTASH_REDIS_REST_URL: httpsUrlSchema,
  UPSTASH_REDIS_REST_TOKEN: z.string().min(10),

  CRON_SECRET: z.string().min(16),

  // Test-only switches. Rejected in production by `crossFieldProblems`.
  MEMORY_DRIVER: z.enum(["memwal", "fake"]).default("memwal"),
  LLM_DRIVER: z.enum(["groq", "fake"]).default("groq"),
  E2E_AUTH_SECRET: z.string().min(16).optional(),
};

export const clientSchema = {
  NEXT_PUBLIC_APP_URL: publicUrlSchema,
  NEXT_PUBLIC_WALRUS_EXPLORER_BLOB_URL: explorerPrefixSchema,
  NEXT_PUBLIC_SUI_EXPLORER_OBJECT_URL: explorerPrefixSchema,
};

export interface CrossFieldInput {
  NODE_ENV?: string | undefined;
  MEMWAL_SERVER_URL?: string | undefined;
  ALLOW_CUSTOM_RELAYER?: boolean | undefined;
  MEMORY_DRIVER?: string | undefined;
  LLM_DRIVER?: string | undefined;
  E2E_AUTH_SECRET?: string | undefined;
}

/** Cross-field production rules. Returns human-readable problems (empty = ok). */
export function crossFieldProblems(env: CrossFieldInput): string[] {
  if (env.NODE_ENV !== "production") return [];
  const problems: string[] = [];
  const relayer = env.MEMWAL_SERVER_URL?.replace(/\/+$/, "");
  if (
    relayer !== undefined &&
    relayer !== MAINNET_RELAYER_URL &&
    env.ALLOW_CUSTOM_RELAYER !== true
  ) {
    problems.push(
      `MEMWAL_SERVER_URL must be ${MAINNET_RELAYER_URL} in production (set ALLOW_CUSTOM_RELAYER=true to override).`,
    );
  }
  if (env.MEMORY_DRIVER === "fake") problems.push("MEMORY_DRIVER=fake is test-only.");
  if (env.LLM_DRIVER === "fake") problems.push("LLM_DRIVER=fake is test-only.");
  if (env.E2E_AUTH_SECRET) problems.push("E2E_AUTH_SECRET must not be set in production.");
  return problems;
}
