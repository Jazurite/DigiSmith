# Token counter (K.4) has no producer of real `TokenUsage` yet

**Status:** Gap, not yet applied. Found during K.4's final whole-branch review (2026-09-11).

**Source:** K.4 shipped `scripts/token-counter/computeTokenCost(provider, model, usage)`, which
takes a `TokenUsage` (`{ inputTokens, outputTokens, cacheReadTokens? }`) directly from a caller.
K.4's own design doc named "a runner's already-parsed `ParsedResult`" as the expected primary
caller, but wiring that specific integration was explicitly out of K.4's scope — a separate,
later decision.

## The actual gap

`scripts/runners/types.ts`'s `ParsedResult` carries only `status`, `resultText`, `sessionId`,
`costUsd` (the SDK's self-reported dollar figure — the exact figure K.4 exists to replace) and
`xtmlLeakDetected`. It does **not** carry token counts at all. Neither
`scripts/runners/claude-code.ts` nor `scripts/runners/opencode.ts` extracts `input_tokens`/
`output_tokens`/`cache_read` from the raw event stream today, even though
`backlog/gateway-cost-comparison-k4.md` documents that a real `usage` object genuinely appears in
Claude Code's own `stream-json` final result event.

Net effect: as shipped, `computeTokenCost` is only reachable by hand-assembling a `TokenUsage` —
nothing in this repo currently produces one from a real dispatch.

## What would close this

Extend `ParsedResult` with an optional token-usage field, and populate it in both runner
parsers from the real `usage` object each already has access to in its raw event stream. This is
a prerequisite for actually wiring K.4 into `offload-implementer` or any other real caller — not
K.4 itself, and not the same thing as K.4.2 (the native-vs-gateway *comparison* logic, which
depends on this existing first).

## Why not applied yet

Explicitly out of scope for K.4's own design (wiring into any specific caller was excluded), and
surfaced only during K.4's final review — no map item currently owns it. Needs a decision on
whether it belongs under K (as a K.4-adjacent sub-item) or is folded into whatever eventually
implements K.4.2.
