# Friction log

What got in our way while building Callback, and what we did about it. Each item is sourced from our own measurements (`docs/SDK_NOTES.md`, `eval/results/`, the bug-hunt re-runs); nothing here is hearsay. Format: symptom → how we hit it → what we did.

## Walrus Memory

**1. An all-dropped recall looks like "no memories".**
`recall()` answered `results: []`, `total: 0`, `dropped_count: N` for a namespace of healthy memories, with no error.
We hit it on Mainnet on 2026-09-22 (8 of 10 consecutive recalls in one window, and the first recall after idle); it didn't reproduce in 30 recalls on 2026-09-24.
We throw a typed `MEMORY_RECALL_DROPPED`, retry once ~400 ms later inside the recall timeout, then degrade with an honest "memory unavailable" notice (`recall_events.attempt` records the retry).

**2. Saves take tens of seconds.**
`rememberAndWait` took 34.8 s and 82.1 s on two runs; a job can report `done` a moment before recall can see it.
We hit it in our first Mainnet round trips (2026-09-22) and again in the memory eval on 2026-09-27: median 40 s over 24 saves, and 2 saves outlasted our 45 s wait and finished about 5 minutes after submission (`eval/results/20260927-1213`).
We save in `after()` so replies never wait, record each job as `pending` in Postgres, and complete it later from job status. A new session whose last session is still saving shows a live "still saving" count, and the coach is told notes may be missing.

**3. Accepted jobs can fail on an upstream rate limit.**
Jobs ended `failed` with `seal encrypt failed … Too Many Requests` (an upstream Sui RPC call).
We hit it in 4 of 15 single-job writes on 2026-09-22 (0 of 7 on 2026-09-24).
We resubmit such jobs (500 ms, then 2 s) and re-point the same metadata row, so one memory is still one row.
Issue: [MystenLabs/MemWal#999](https://github.com/MystenLabs/MemWal/issues/999).

**4. The positional `recall()` overload drops the namespace.**
`recall(query, { limit }, namespace)` type-checks, but the call reads the default namespace instead.
We hit it while reading the SDK; an offline script confirmed it on 2026-09-24.
We only use the object form `recall({ query, namespace, limit })`, with the namespace derived on the server.

**5. Long user turns get no memories under `withMemWal`.**
The relayer rejects recall queries over 16,384 bytes, and `withMemWal` swallows the error.
We hit it with a probe that sent a long pasted message (re-run 2026-09-24).
We call `recall()` ourselves with the query capped at 500 characters (a mode-specific fallback query for very short messages).

## Qwen 3.8 on Groq

Model `qwen/qwen3.8-27b` via `@ai-sdk/groq` 3.0.66 (Vercel AI SDK v6). Measurements: `eval/results/groq-checks-2026-09-27/results.json` (`pnpm groq:checks`).

**1. "Request too large" on the input-tokens-per-minute limit.**
Groq rejected a call with `Request too large for model qwen/qwen3.8-27b … on input tokens per minute (ITPM): Limit 7000, Requested 11716` (on-demand tier).
We hit it on 2026-09-22 when a probe let `withMemWal` inject a 51 KB memory verbatim.
We budget the prompt: at most 8 facts + 6 recap lines + the profile, each fact capped at 400 characters, 12 turns of history; the eval spaces Groq calls ≥ 12 s apart and backs off 30 s on "busy".

**2. Strict JSON schema: every property must be required.**
An optional field is rejected: `400 invalid JSON schema for response_format … The following properties must be listed in required: b` (re-checked 2026-09-27).
We hit it designing the extraction schema (`structuredOutputs` + `strictJsonSchema`).
Every field is required; "optional" ones are `nullable`, and length limits are enforced after parsing, not in the schema.

**3. Reasoning on vs off made no measurable difference here.**
With `reasoningEffort: "none"` vs `"default"` on the same short prompt (3 runs each, alternating): medians 445 ms vs 618 ms, and no reasoning tokens reported either way.
We checked because a "thinking" pass before every coaching reply would add latency and could leak into the UI.
We pin `reasoningEffort: "none"`, `reasoningFormat: "hidden"` and `sendReasoning: false`, so replies never depend on a default and reasoning never reaches the UI or the transcript. A short prompt isn't a full coaching turn; we didn't measure long ones.
**4. The tag enum holds; the choice of tag wobbles.**
In 6 of 6 strict-mode extraction runs on the eval's session-1 exchanges, every tag was inside the enum (`structure`/`specificity`/`impact`/`communication`/`other`). But the same exchange got a different assignment tag across two runs (`communication` vs `structure` for one persona).
We rely on tags to count repeated mistakes across sessions, so a wobble can split one habit into two tags.
Patterns need ≥ 2 distinct sessions with the same tag, the chip label says "in N sessions I can see", and `other` never forms a pattern. We haven't solved the wobble.

**5. Examples in feedback invent numbers.**
In the memory eval, all three "Fix next time" lines contained example figures or details the user never gave (e.g. "a 40% drop-off rate"); saved as assignments, they came back next session as lines to say.
We hit it reading every reply of eval run `20260927-1213`.
The rubric prompt now asks for placeholders like `[X%]` or `[who]` instead of invented figures (not re-evaluated yet: Mainnet write budget).