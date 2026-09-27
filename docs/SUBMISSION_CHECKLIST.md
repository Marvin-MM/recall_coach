# Submission checklist — Walrus Foundation "Chatbots That Remember"

Deadline: **9 October 2026, 14:00 UTC**. Items marked `TODO(human)` need a person, an account, or real users; nothing here may be filled with invented data.

## Status

- [ ] Live URL (landing page with widget) — `TODO(human)`: deploy to Vercel (see README → Deployment)
- [ ] Public GitHub repo with README + setup — `TODO(human)`: push this repo (MIT, gitleaks-clean)
- [x] LLM/runtime statement: **Qwen 3.8 27B (`qwen/qwen3.8-27b`) on Groq via the Vercel AI SDK v6; Next.js 16 on Vercel (Node.js runtime)**
- [x] Walrus Mainnet relayer confirmed — `pnpm memwal:verify` passed on 2026-09-22 (health ok, API 1.0.0, remember→recall round trip, blob `ua9JbxEsx7vZnr4T4AWNXx3URvBm47WVMyU1Yo3YtHo`)
- [ ] Account ID + Agent ID + blob count — IDs below; blob count from `pnpm memwal:stats` against the **production** DB once real users exist
- [ ] ≥3 real users × ≥10 done blobs each — `TODO(human)` (see docs/USER_TEST_GUIDE.md; check with `pnpm memwal:stats` or `/admin/evidence`)
- [x] Article ready to publish once evidence is in: `docs/article/ARTICLE_FINAL.md` (local only). Real-use numbers, screenshots and the before/after transcript are `TODO(human)` slots
- [x] X post draft: `docs/article/X_POST.md` (local only)
- [x] Bug filing pack: `bug-hunt/ready/*.md`, `bug-hunt/ready/COMMENTS.md` and `bug-hunt/FILING_PLAN.md`, plus `docs/article/FEEDBACK_FORM.md` (all local only, gitignored)
- [x] Memory eval on Mainnet: `eval/results/20260927-1213/SUMMARY.md` (`pnpm eval:memory`)
- [x] Friction log: `FRICTION.md` (Walrus Memory + Qwen on Groq, sourced)
- [x] Paste-ready form values: `docs/SUBMISSION_FORM.md`
- [ ] Human-only items (below)

## Form fields and where each value comes from

| Field | Value / source |
|---|---|
| Project name | `Callback` (`src/config/site.ts`) |
| One-liner | “An interview and skill coach that remembers your target role, your past mistakes, how you like to learn, and how far you've come — across every session.” (“every device” only once a real cross-device test is recorded in `docs/article/ARTICLE_SOURCES.md`) |
| Live demo URL | `TODO(human)` — Vercel production URL after deploy |
| GitHub repo | `TODO(human)` — public repo URL after push |
| Model / runtime | Qwen 3.8 27B (`qwen/qwen3.8-27b`) on Groq, Vercel AI SDK v6 (`ai@6`, `@ai-sdk/groq@3`), Next.js 16, Vercel Node.js runtime |
| Walrus network | Mainnet, relayer `https://relayer.memory.walrus.xyz` (`/api/health` shows live status) |
| **MEMWAL_ACCOUNT_ID** (MemWalAccount object) | `0xc3adfdb2703fd5d340eb440c49225b0fdce343d719bb790b97e21a5d6d85641d` — printed by `pnpm memwal:verify`, shown on `/admin/evidence` |
| **MEMWAL_AGENT_ID** | **The delegate key's Ed25519 public key**: `d4e7caa75a09c0e210ee4b9a49b78f14222cedc0c68171b5efed20d722c10e8e`. Source: `pnpm memwal:verify` (“Delegate public key”, from the SDK's `getPublicKeyHex()`), `/admin/evidence`. This matches the dashboard's “public key” of the delegate key pair (see MystenLabs/MemWal #357, #364, #385 — the ambiguity is a known friction point) |
| Delegate Sui address (if asked) | `0x6658bf90264581540a2a4293184eaea9156c73e69292889ddd28b796014e6b22` — `delegateKeyToSuiAddress()`; appears as “Sender” on explorers |
| Explorer link (account) | `https://suiscan.xyz/mainnet/object/0xc3adfdb2703fd5d340eb440c49225b0fdce343d719bb790b97e21a5d6d85641d` |
| Blob count | `TODO(human)` — “Done blobs” total from `pnpm memwal:stats` (production DB) / `/admin/evidence`; cross-checked with on-chain `memory_count` |
| Number of real users | `TODO(human)` — `/admin/evidence` totals (pseudonymized) |
| Example blob links | Any `blob_id` from `/admin/evidence` → `https://walruscan.com/mainnet/blob/<blobId>` |
| Article URL (Medium/Inkray) | `TODO(human)`: publish `docs/article/ARTICLE_FINAL.md` after filling real numbers, screenshots and the transcript |
| X post URL | `TODO(human)` — post `docs/article/X_POST.md` under the session announcement |
| Feedback (bug + improvement) | `docs/article/FEEDBACK_FORM.md` |
| Bug bounty reports | Follow `bug-hunt/FILING_PLAN.md` (file `bug-hunt/ready/*.md` as GitHub issues, post `COMMENTS.md` drafts; if issue creation is restricted, use the bug-bounty form) |
| Prize wallet | `TODO(human)` — a dedicated Sui wallet address you control (never the MemWal owner key) |

## Human-only items

- [ ] Register on DeepSurge for the hackathon
- [ ] Create / choose a dedicated Sui wallet address for prizes
- [ ] Join the Walrus Discord
- [ ] Submit the Airtable form (fields above)
- [ ] File the issues and comments in `bug-hunt/FILING_PLAN.md` order (or the bug-bounty form), then paste the URLs into the plan and `FEEDBACK_FORM.md`
- [ ] Recruit ≥3 testers; run docs/USER_TEST_GUIDE.md over ≥2 days
- [ ] Replace `TODO(human)` slots in `src/content/before-after.ts` and the article with real, consented material; ask me to pull production evidence (`pnpm memwal:stats --blob-links`) once all testers are done
- [ ] Publish the article; post on X under the session announcement
- [ ] Google Cloud Console: OAuth consent screen → *In production*; add the production redirect URI
- [ ] Vercel: set `TRANSCRIPT_ENCRYPTION_KEY` (new key per environment, backed up) and run `pnpm db:migrate` against production (adds session history)

## Pre-submission verification

```bash
pnpm run ci                 # lint, typecheck, unit + integration tests, build
pnpm test:e2e           # Playwright + axe (needs .env.e2e)
pnpm memwal:verify      # against Mainnet
pnpm memwal:stats --blob-links   # point DATABASE_URL at production (read-only queries)
curl https://<domain>/api/health
```
