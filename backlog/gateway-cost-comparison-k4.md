# Gateway-vs-native-Claude-Code cost comparison (K.4)

**Status:** Not applied. Idea only, depends on K.3.

**Map item:** **K.4**, sibling to [K.3](ai-gateway-vendors-k3.md) under **K** ("Model tiering").
Depends on K.3 (pluggable gateway choice) existing first — this is the "show the savings" layer
on top of it.

**Source:** 2026-08-28, same conversation as K.3, sparked directly by catching that the Claude
Agent SDK's self-reported `total_cost_usd` was wrong for a third-party model (see K.3's "Cost
data" section for the full finding).

## The idea

Once a task can run through a gateway (K.3), show what it actually cost via that gateway **vs.**
what it would have cost running natively in Claude Code (Anthropic's own pricing) — turn "switch
providers" into a quantified decision instead of a guess.

## Building block, already proven by the K.3 spike

The SDK's token *counts* (input/output/cache) are reliably reported even when its self-reported
*cost* isn't. So: use the real token counts, then apply the correct pricing table for each side
yourself — the gateway's real rate (read from the provider's own dashboard/API, per K.3's
methodology finding) plus Anthropic's own current rate for the "ran natively" comparison — rather
than trusting either side's self-reported dollar figure.

## Open questions

- Per-task display only, or a running/cumulative tally across a whole plan or a longer period?
  **Deferred to [[native-model-router-z.md]] (2026-09-04)** — this decision only really matters
  once there's a router consuming the numbers; not worth locking in for a standalone report.
- Where would this actually surface — in the offload skill's own report, or a separate
  DigiSmith-level view? **Also deferred to Z**, same reasoning.

## Scope boundary confirmed (2026-09-04)

K.4 is **report-only** — it computes and displays numbers after a task finishes, full stop. Any
"which model should we pick" decision logic is explicitly **not** K.4's job; that's
[[native-model-router-z.md]]'s territory entirely. K (the map letter) is infrastructure/plumbing;
Z is the decision layer. K.4 would, if built, be one input Z's design could eventually consume —
it does not decide anything itself.

## Real blockers found (2026-09-04) — why this is parked, not just "not designed yet"

Two independent, concrete feasibility problems surfaced when actually researching how to get real
token/cost data for a single dispatch — this isn't "no design exists yet," it's "the two obvious
data sources both have real problems":

1. **Claude Code's own `stream-json` token counts are confirmed wrong, not just imprecise.**
   Documented bug (Anthropic SDK GitHub issue #28197): `usage.input_tokens` in Claude Code's own
   JSONL/stream-json logs are streaming placeholder values (0 or 1) that never get updated to the
   real final count — observed as a 100-174x undercount. This directly contradicts the K.3-era
   assumption this file originally recorded ("token counts are reliably reported even when
   self-reported cost isn't") — that assumption does not hold for Claude Code's `stream-json`
   output specifically. Separately unconfirmed: whether Chutes/TokenReply even proxy the `usage`
   object correctly when acting as the gateway in the first place.
2. **Chutes' own usage API has the wrong granularity to attribute cost to one specific task.**
   Checked via the `chutes-usage-and-billing` skill: `GET /users/{user_id}/usage` (the real,
   working, personal-usage endpoint) returns **time-bucketed data by hour**, not per-request — no
   way to isolate "this one offloaded dispatch's" tokens from "everything else that happened in
   that hour." A per-invocation-granularity endpoint does exist
   (`/invocations/exports/{y}/{m}/{d}/{hh}.csv`, real `invocation_id`/timestamps/`metrics`
   columns) but it's **platform-wide** (every Chutes user, not just this account) and, as of the
   skill's last verification, appeared to have **stopped updating** two months prior (every later
   date probed returned 404) — the one source with the right shape may not currently be live.
   **TokenReply's own usage API was never checked** — Jack chose to park K.4 rather than spend
   more research verifying it, so this remains a completely open question, not a confirmed dead
   end, on that specific vendor.

Net effect: neither of the two "just read real numbers from somewhere" data sources actually
works cleanly today. A real implementation would need to solve a genuine attribution problem
(e.g. correlating a dispatch's timestamp window against an hourly bucket and hoping nothing else
ran concurrently — fragile, not rigorous) or find a different data source entirely.

## TokenReply checked, plus a live correction to blocker #1 (2026-09-04, later same day)

**TokenReply's own docs** (tokenreply.com/docs): confirmed they track real per-request usage
internally — their "Usage Logs" feature shows, per request, model/input-output token
counts/cost/timestamp/status, better granularity than Chutes' hourly buckets. But no documented
API endpoint exists to pull it programmatically — every reference points to a **web dashboard
page only**. Their compatibility page claims full OpenAI response-structure parity, which by
itself implies their raw completion response should include a real `usage` object.

**Live dispatch test, correcting blocker #1 above:** ran a real `claude -p --output-format
stream-json --verbose` dispatch through TokenReply to check directly. The final `result` event
**did** carry a real, non-placeholder `usage` object (`input_tokens: 586, output_tokens: 154`)
plus a `modelUsage` breakdown with a computed `costUSD` — not the "0 or 1 placeholder, never
updated" pattern GitHub issue #28197 described. That documented bug may describe a different
artifact (e.g. saved session-transcript JSONL files under `~/.claude/projects/`) rather than the
live `--output-format stream-json` event stream itself — **blocker #1 as originally written
does not hold up against direct evidence** and should not be trusted at face value going forward.

**However, this same test surfaced a much bigger, unrelated problem**, now tracked separately:
[[tokenreply-kimi-k3-tool-calling-failure]] — the dispatched task silently failed to execute any
real tool call at all (the model emitted garbled pseudo-tool-call text Claude Code didn't
recognize), so whether *this specific test's* token counts reflect a "real" successful task is
unclear — they're the counts for whatever garbage exchange actually happened, not a working
implementer run. The presence and shape of the `usage` field is now confirmed real; its
reliability under a genuinely successful task is still unverified.

## Why not applied yet

Parked, not just undesigned. Depends on K.3 (shipped). Blocker #2 (Chutes' hourly-only
granularity) still stands as researched. Blocker #1 (Claude Code's token counts) turned out to be
overstated — live evidence shows real counts in the `stream-json` final result — but the dispatch
that proved this also failed to actually execute anything, so K.4 is still not safely buildable
right now: fix [[tokenreply-kimi-k3-tool-calling-failure]] first, get a genuinely successful
dispatch's real token counts to confirm they hold up under real work, then revisit.
