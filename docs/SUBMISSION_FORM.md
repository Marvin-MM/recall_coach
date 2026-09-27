# Submission form: paste-ready fields

Copy each value into the form as-is. `TODO(human)` values need a person, an account or real users, and must never be filled with invented data. Sources are in brackets; `docs/SUBMISSION_CHECKLIST.md` has the longer checklist.

| Field | Paste this |
|---|---|
| Project name | Callback |
| Tagline | The interview coach that remembers. |
| One-liner | An interview and skill coach that remembers your target role, your past mistakes, how you like to learn, and how far you've come — across every session. *(add "and every device" only after the cross-device check in `docs/article/CAPTURE_GUIDE.md` §4 is recorded)* |
| Short description | Callback runs mock interviews and gives rubric feedback with one concrete fix per answer. After every reply it saves typed notes (mistakes, strengths, the fix it asked for) to Walrus Memory, encrypted with Seal on Walrus Mainnet. It recalls them before every reply, so the next session opens with last time's assignment and flags mistakes that repeat across sessions. Each reply shows which memories it used, with Walrus blob links. Amnesia Mode runs the same coach with no memory, for comparison. |
| Live demo URL | `TODO(human)`: Vercel production URL after deploy |
| Public repo | `TODO(human)`: GitHub URL after push |
| Article URL | `TODO(human)`: Medium URL after publishing `docs/article/ARTICLE_FINAL.md` |
| X post URL | `TODO(human)`: URL of the reply posted from `docs/article/X_POST.md` |
| LLM / runtime | Qwen 3.8 27B (`qwen/qwen3.8-27b`) on Groq, via the Vercel AI SDK v6; Next.js 16 on Vercel (Node.js runtime). Primary LLM is not from Anthropic or OpenAI. |
| Walrus network | Mainnet, relayer `https://relayer.memory.walrus.xyz`, `@mysten-incubation/memwal` 0.1.8 [`package.json`, `pnpm memwal:verify`] |
| **Agent ID** | `d4e7caa75a09c0e210ee4b9a49b78f14222cedc0c68171b5efed20d722c10e8e`: the delegate key's public key (SDK `getPublicKeyHex()`, printed by `pnpm memwal:verify` as "Delegate public key") |
| Account ID (if the form asks separately, or if Agent ID turns out to mean the account) | `0xc3adfdb2703fd5d340eb440c49225b0fdce343d719bb790b97e21a5d6d85641d` (MemWalAccount object; [Suiscan](https://suiscan.xyz/mainnet/object/0xc3adfdb2703fd5d340eb440c49225b0fdce343d719bb790b97e21a5d6d85641d)) |
| Agent ID check | `TODO(human)`: confirm in the Walrus Discord which one "Agent ID" means (MemWal #357, #364 and #385 show the terms are used inconsistently). Use the delegate public key unless they say the account ID |
| Blob count | `TODO(human)`: "done blobs" from `pnpm memwal:stats` against the production DB, after testers finish |
| Real users | `TODO(human)`: from `/admin/evidence` (pseudonymized), after testers finish |
| Example blob links | `TODO(human)`: 2 links from `pnpm memwal:stats --blob-links`, with the users' OK |
| Memory eval | 3 synthetic personas on Mainnet, same 18 questions: Amnesia Mode 0/18, memory 16/18 by keywords (14/18 after reading the replies). `<repo>/blob/main/eval/results/20260927-1213/SUMMARY.md` (`TODO(human)`: replace `<repo>` once public) |
| Feedback: bug | Paste "Bug / friction" from `docs/article/FEEDBACK_FORM.md` (125 words) |
| Feedback: improvements | Paste the two "Improvement ideas" from `docs/article/FEEDBACK_FORM.md` |
| Bug report / issue URLs | `TODO(human)`: the URLs you get when filing (steps below), in `bug-hunt/FILING_PLAN.md` order |
| Prize wallet | `TODO(human)`: a dedicated Sui address you control (never the MemWal owner key or the delegate key) |
| Team / contact | `TODO(human)` |

## How to file the issues (before submitting the form)

1. Check that https://github.com/MystenLabs/MemWal/issues/new works for your account. If issue creation is restricted, paste each file into the bug-bounty form instead.
2. Go down the table in `bug-hunt/FILING_PLAN.md` in order (01, 02, 03, 06, 07, 09, 10, 11, then the features 12 and 13).
3. For each: the title is the file's `#` heading without the `#`; the body is the rest of the file, pasted unchanged. The scripts are inline, so there's nothing to attach.
4. Copy each new issue's URL into the plan's "Filed URL" column, `docs/article/FEEDBACK_FORM.md`, `FRICTION.md` and the article's `TODO(human): issue URL` slots.
5. Security-relevant findings never go to GitHub or Discord: email security@mystenlabs.com.
6. Comments in `bug-hunt/ready/COMMENTS.md` are optional goodwill; post them last.

## Before you press submit

- [ ] Every `TODO(human)` above is filled with a real value (or the field is left empty)
- [ ] The article and the X post are live, and their links work when logged out
- [ ] `/api/health` on the live URL returns 200
- [ ] The repo is public, and `eval/results/20260927-1213/SUMMARY.md` and `FRICTION.md` render
