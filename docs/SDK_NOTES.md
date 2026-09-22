# SDK notes — confirmed signatures, versions, measurements

Every signature below was read from the **installed** `.d.ts` files in `node_modules` (spec rule 2). Where the build prompt and the installed types disagree, the installed types win and the discrepancy is listed under "Deviations from the build prompt".

## Installed versions (2026-09-22)

| Package | Version | Notes |
|---|---|---|
| `next` | 16.3.6 | App Router, `src/proxy.ts` (middleware renamed to proxy in v16) |
| `ai` | 6.0.286 | AI SDK v6 per spec. **v7.0.x is the latest on npm**; v6 is still maintained, so we stayed on v6 |
| `@ai-sdk/react` | 3.0.289 | pairs with `ai@6` |
| `@ai-sdk/groq` | 3.0.66 | pairs with `ai@6` (`@ai-sdk/groq@4` targets `ai@7`) |
| `@ai-sdk/provider` | 3.0.16 | direct dep for `LanguageModelV3*` types (fake model) |
| `@mysten-incubation/memwal` | 0.1.8 | peer deps `@mysten/sui` 2.31.3, `@mysten/seal` 1.4.13, `@mysten/walrus` 1.2.28 |
| `better-auth` | 1.7.5 | Drizzle adapter re-exported from `better-auth/adapters/drizzle` |
| `auth` (CLI) | 1.7.5 | **successor of the deprecated `@better-auth/cli`** |
| `drizzle-orm` / `drizzle-kit` | 0.45.3 / 0.31.11 | |
| `zod` | 4.6.5 | |
| `@upstash/ratelimit` / `@upstash/redis` | 2.1.0 / 1.39.0 | |
| `@t3-oss/env-nextjs` | 0.13.11 | |
| Relayer | `relayerVersion 0.1.0`, `apiVersion 1.0.0` | `minSupportedSdk.typescript = 0.0.4`, feature flags include `remember.bulk`, `remember.asyncJobs` |

## `@mysten-incubation/memwal` 0.1.8 — what we use

```ts
MemWal.create(config: { key: string | Uint8Array; accountId: string; serverUrl?: string; namespace?: string; requestTimeoutMs?: number }): MemWal
recall(params: { query: string; limit?: number; topK?: number; namespace?: string; maxDistance?: number;
                 maxTokens?: number; truncationStrategy?; countTokens?; scoringWeights?; sort?: "relevance" | "recent" }): Promise<RecallResult>
//   RecallResult = { results: { blob_id; text; distance; created_at? }[]; total; meta?; dropped_count? }
rememberBulkAsync(items: { text: string; namespace?: string }[]): Promise<{ job_ids: string[]; total; status }>   // max 20 items
waitForRememberJobs(jobIds: string[], namespaces?: string[], opts?: { pollIntervalMs?; timeoutMs? }): Promise<RememberBulkResult>
//   RememberBulkResult = { results: { id; blob_id; status: "done" | "failed" | "timeout"; namespace; error? }[]; total; succeeded; failed }
getRememberBulkStatus(jobIds: string[], opts?: { timeoutMs? }): Promise<{ results: { job_id; status: "pending"|"running"|"uploaded"|"done"|"failed"|"not_found"; blob_id?; error? }[] }>
rememberAndWait(text, namespace?, opts?: { pollIntervalMs?; timeoutMs?; idempotencyKey? }): Promise<{ id; job_id?; blob_id; owner; namespace }>
rememberBulkAndWait(items, opts?): Promise<RememberBulkResult>
health(): Promise<HealthResult>            // public, unsigned
compatibility(): Promise<RelayerVersionMetadata>
getPublicKeyHex(): Promise<string>
restore(namespace: string, limit?: number): Promise<{ restored; skipped; failed; total; namespace; owner; truncated }>
listNamespaces(options?: { cursor?; limit? }): Promise<{ namespaces: { id; name; memory_count; storage_used; updated_at }[]; next_cursor; has_more; snapshot_version }>
delegateKeyToSuiAddress(privateKeyHex: string): Promise<string>
delegateKeyToPublicKey(privateKeyHex: string): Promise<Uint8Array>
MemWalCompatibilityError, MemWalMock (test double with the same method shapes + forget()/clear())
withMemWal(model: any, options: WithMemWalOptions): any          // from "@mysten-incubation/memwal/ai" — used only in bug-hunt probes
```

Error shape (from `dist/memwal.js`): plain `Error` with numeric `status` (HTTP) and optional `serverCode` (e.g. `ERR_TIMESTAMP_OUT_OF_BOUNDS`); request deadline errors have `name = "MemWalRequestTimeout"`, `status = 504`; version mismatch throws `MemWalCompatibilityError`. Mapped in `src/server/memory/errors.ts`.

Key format: `MemWalConfig.key` accepts **hex or `suiprivkey1…`**. Our env validation deliberately rejects `suiprivkey…` (owner keys are usually exported in that form) and requires the 64-hex delegate seed.

## AI SDK v6 — what we use

- `streamText({ model, system, messages, temperature, topP, maxOutputTokens, providerOptions, abortSignal, onError })` → `result.toUIMessageStream({ onError, sendReasoning })`
- `createUIMessageStream({ execute({ writer }), onError })` + `createUIMessageStreamResponse({ stream })`; `writer.write({ type: "data-memory", data })`, `writer.merge(stream)`.
- `convertToModelMessages(messages)` is **async** in v6 (returns `Promise<ModelMessage[]>`).
- `generateObject` is **`@deprecated` — "Use `generateText` with an `output` setting instead."** We use `generateText({ output: Output.object({ schema }) })` and read `result.output`.
- Test double: `MockLanguageModelV3` from `ai/test` (`doStream` / `doGenerate`), `simulateReadableStream` from `ai`.
- `LanguageModelV3` stream parts: `stream-start`, `text-start`, `text-delta { id, delta }`, `text-end`, `finish { finishReason: { unified, raw }, usage: { inputTokens: { total, noCache, cacheRead, cacheWrite }, outputTokens: { total, text, reasoning } } }`.

## `@ai-sdk/groq` 3.0.66 — provider options

`providerOptions.groq`: `reasoningFormat?: "parsed" | "raw" | "hidden"`, `reasoningEffort?: "none" | "default" | "low" | "medium" | "high"`, `parallelToolCalls?`, `user?`, `structuredOutputs?`, `strictJsonSchema?`, `serviceTier?`.

Verified directly against Groq (2026-09-22): `qwen/qwen3.8-27b` is listed for our key; `reasoning_effort: "none"` returns no reasoning; strict `json_schema` response format works; `json_object` works. Chat uses `reasoningEffort: "none", reasoningFormat: "hidden"`, temperature 0.7, topP 0.8, 900 max tokens. Extraction uses strict structured outputs (all properties required + nullable; length limits enforced after parsing).

## Better Auth 1.7.5

- `betterAuth({ database: drizzleAdapter(db, { provider: "pg", schema, transaction: true }), socialProviders.google: { clientId, clientSecret, disableDefaultScope, scope, prompt }, session: { expiresIn, updateAge }, advanced: { cookiePrefix, useSecureCookies, defaultCookieAttributes, database: { generateId } }, databaseHooks.user.create.after, plugins: [nextCookies()] })`
- `toNextJsHandler(auth)`, `nextCookies()` from `better-auth/next-js`; `getSessionCookie(request, { cookiePrefix })` from `better-auth/cookies`; `createAuthClient()` from `better-auth/react`.
- `testUtils()` plugin (from `better-auth/plugins`) provides `ctx.test.saveUser/createUser/getCookies/login` — used only for the E2E sign-in route.
- **Type issue:** `testUtils()` declares `init()` returning `options: … | undefined`, which is not assignable to `BetterAuthPlugin` under `exactOptionalPropertyTypes: true`. We cast that single test-only plugin (`src/server/auth/auth.ts`).
- Default user ids are mixed-case random strings; we set `advanced.database.generateId: () => crypto.randomUUID()` so ids are lowercase (namespace derivation lowercases).

## Measured Walrus Memory behaviour (Mainnet, from this machine)

| Operation | Observation |
|---|---|
| `rememberAndWait` (1 item) | 34.8 s and 82.1 s on two runs |
| `recall` cold (first call on a new client) | ≈4.7 s |
| `recall` warm, sequential | ≈1.35–1.6 s |
| 3 × `recall` in parallel, same client | 3.1 s / 5.2 s / 7.2 s (7.2 s wall) — parallel calls get slower, not faster |
| `recall` on a namespace with no data | ≈0.9 s, empty result (indistinguishable from a typo'd namespace) |
| remember → recall visibility | Run 1: recall immediately after `done` returned **0 results**; a later recall found it (distance 0.443). Run 2: visible 1.7 s after `done` |
| Relevant-memory distance | 0.44–0.49 for a paraphrased query → `maxDistance: 0.65` for facts recall |
| Hang | One fresh-client `recall` (no explicit `requestTimeoutMs`) produced no output for >3 min and was killed; re-running with `requestTimeoutMs: 30000` completed in ~10 s. Not reproduced since — tracked as `needs-human-verify` in `bug-hunt/FINDINGS.md` |

Consequences in our code:
- `MEMWAL_RECALL_TIMEOUT_MS` defaults to **6000** in `.env.example` (spec suggested 3000, which would degrade most turns); the profile snapshot is cached per warm instance to avoid one recall per turn.
- `MEMWAL_SAVE_TIMEOUT_MS` defaults to **45000**. When waiting times out, rows stay `pending` (not `failed`) and are completed later by `reconcilePendingJobs` (session-summary polling and the daily cron) via `getRememberBulkStatus`.
- `waitForRememberJobs` maps a `done` status without `blob_id` to `blob_id: ""`; our adapter treats that as `MISSING_BLOB_ID` instead of storing an empty id.

## Deviations from the build prompt (and why)

1. **`ai` v6 not v7** — spec pins v6; v6 is maintained. `generateObject` → `generateText` + `Output.object` (deprecated in v6).
2. **`@better-auth/cli` → `auth`** — the former is deprecated on npm; `pnpm auth:generate` uses `auth@1.7.5` with a schema-only config (`scripts/auth-cli.config.ts`).
3. **Local Postgres in dev** — `drizzle-orm/neon-serverless` requires Neon's WebSocket proxy, so `src/server/db/client.ts` uses the Neon Pool for `*.neon.tech` hosts and `node-postgres` otherwise (both support interactive transactions).
4. **`MemoryPort.rememberMany` takes an `onAccepted` hook and the port has `jobStatuses()`** — needed to write `pending` rows after acceptance but before completion (spec §8.8 step 4) and to reconcile slow Mainnet saves.
5. **Timeouts** — see measurements above.
6. **AI Elements** — `ai-elements@latest` has no `--help`; running it installs *all* components. We kept `conversation`, `message` (its `MessageResponse` replaces the old `response` component), `prompt-input`, `suggestion`, `shimmer` (replaces `loader`), and removed the heavy streamdown plugins (mermaid, math, cjk, code).
