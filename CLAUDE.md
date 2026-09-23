@AGENTS.md

# Recall — interview coach that remembers

Next.js 16 (App Router) + Vercel AI SDK v6 + Groq (Qwen 3.8 27B) + Walrus Memory (`@mysten-incubation/memwal`) + Better Auth + Drizzle/Postgres. Full spec: `../BUILD_PROMPT.md`. Confirmed SDK signatures: `docs/SDK_NOTES.md`.

## Non-negotiable rules
1. **Never fabricate** users, transcripts, screenshots, metrics, blob IDs, bug repros or test results. Real-world data we cannot produce is marked `TODO(human):`.
2. **Verify before integrating**: check installed `.d.ts` in `node_modules` before using `memwal`, `ai`, `@ai-sdk/groq`, `better-auth`. Installed types win over docs; log discrepancies in `bug-hunt/FINDINGS.md`.
3. **Delegate key never reaches the browser**: every module importing the memory client starts with `import "server-only";`.
4. **No transcripts in Postgres**. Postgres = identity, session metadata, memory *metadata* (job/blob IDs, kinds, status, timings). Memory text lives only on Walrus.
5. **Namespaces are derived server-side** from the authenticated user id (`deriveNamespaces`). Never accept namespace/user/account ids from request input.
6. **Memory failure never breaks chat**: timeout + typed error + degraded path on every memory call.
7. **Strict TS**: no `any`, no `@ts-ignore` (`@ts-expect-error` with reason only in tests).
8. Conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).

## Directory map
```
src/app/                 routes: (marketing)/, coach/, admin/evidence/, api/*
src/proxy.ts             optimistic cookie check (NOT a security boundary)
src/components/ui/       shadcn (radix-lyra, generated)
src/components/ai-elements/  AI Elements (generated, trimmed)
src/components/widget/   coach widget (state machine, views)
src/components/marketing/ landing sections
src/config/              site.ts, coach.ts
src/env.ts               t3 env validation
src/lib/                 log, errors, result, timeout, utils (framework-agnostic)
src/server/auth/         Better Auth instance, requireUser, admin
src/server/db/           client, schema, auth-schema, repositories/
src/server/memory/       MemoryPort + adapters, namespace, format, recall/persist services
src/server/llm/          model factory, prompts, extraction
src/server/chat/         chat-service (DI via createChatService(deps))
src/types/               shared types (memory, api, chat)
scripts/                 memwal-verify, memwal-stats, evidence-export
bug-hunt/                LOCAL ONLY (gitignored): probes, findings, reports
docs/                    architecture, SDK notes, article drafts, checklist
tests/unit|integration|e2e
```

## Dependency rules
- `components/` → HTTP only (`/api/*`); never import `server/`.
- `app/api/*` → `server/chat`, `server/auth`, `server/db/repositories`.
- `server/chat` depends only on interfaces (`MemoryPort`, model factory, repositories) injected via `createChatService(deps)`.
- Nothing under `server/` imports React.

## Commands
- `pnpm dev` / `pnpm build` / `pnpm run ci` (lint + typecheck + test + build)
- `pnpm test` (Vitest unit + integration; `server-only` is aliased to a stub)
- `pnpm test:e2e` (Playwright + axe; uses `MEMORY_DRIVER=fake`, `LLM_DRIVER=fake`, test DB)
- `pnpm db:generate` / `pnpm db:migrate` (uses `DATABASE_URL_UNPOOLED`)
- `pnpm memwal:verify` (Mainnet round trip in a throwaway namespace)

## Local dev DB
Local Postgres `postgres://postgres:postgres@localhost:5432/recall_coach` (E2E: `recall_coach_e2e`). `src/server/db/client.ts` uses the Neon WebSocket Pool for `*.neon.tech` hosts and node-postgres otherwise. Never drop or modify other databases on the local server.
