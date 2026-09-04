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

## Why not applied yet

Parked, not just undesigned. Depends on K.3 (shipped) but blocked on a real data-source problem
found during research, not merely absent design work — see "Real blockers found" above. Revisit
if either Claude Code's token-reporting bug gets fixed, Chutes' per-invocation export resumes
updating, or TokenReply turns out to expose real per-request usage (unchecked).
