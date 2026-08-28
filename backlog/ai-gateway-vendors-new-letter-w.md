# AI Gateway Vendors (new letter, tentatively W)

**Status:** Not applied. Raw spike material and scope ideas, not yet brainstormed or spec'd.

**Source:** 2026-08-28, sparked mid-conversation while investigating a Chutes-subscription-expiry
concern for K.2 (`digismith:offload-implementer`). Led to discovering TokenReply
(tokenreply.com), a unified OpenAI/Anthropic-compatible gateway to 40+ providers, and a real
live spike proving out an entirely different offload mechanism than K.2's current OpenCode-based
one.

## Core idea

Generalize K.2's model-offload mechanism beyond a single hardcoded provider (Chutes). Let the
user choose or switch between AI gateway providers (Chutes, TokenReply, future ones) rather than
being locked into whichever one K.2 shipped with. This is the same structural insight that came
up when V.1 (Depot managing the OpenCode server) was being designed the same day — "the server
could be one thing, or another package" — just scoped specifically to the *model gateway* layer
this time, not the *coding-agent harness* layer.

## Spike evidence: Claude Agent SDK + TokenReply as an alternate offload path

Live-tested the same day, independent of K.2's existing OpenCode mechanism entirely: the
**Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`, TypeScript — `query()`) can be pointed at
a third-party OpenAI/Anthropic-compatible gateway via `ANTHROPIC_BASE_URL` +
`ANTHROPIC_AUTH_TOKEN` env vars, running a non-Claude model (Kimi K2.7, routed through
TokenReply → Fireworks) as the actual coding agent — not just chatting, real file/bash tool use.

**Confirmed working:**
- The tool-calling loop genuinely works — real `Read`/`Bash`/`Edit` calls, correct results,
  confirmed across multiple runs.
- A full fix → test → commit cycle succeeded for real: commit `070cb6b`, correct formula
  (`price + (price * tax_rate / 100)`), tests genuinely passing (3/3), independently verified
  (not just trusted from the model's own report).

**Two real gotchas found and fixed, both worth carrying into any real design:**
1. By default, `query()` loads the **full** user/project Claude config — every installed plugin,
   every skill, `CLAUDE.md`. This caused the third-party model to inherit
   `using-superpowers`'s mandatory skill-invocation instruction and go down a rabbit hole
   deciding whether to invoke `superpowers:systematic-debugging` before ever touching a
   trivial, fully-specified bug fix — burning 2000+ thinking tokens on pure process overhead.
2. `settingSources: []` does **not** fix this — it only gates `CLAUDE.md`/project settings
   files. The `Skill` tool itself is a separate built-in capability, not controlled by
   `settingSources` at all. The actual fix: `disallowedTools: ["Skill"]`, which excludes the
   tool entirely. Confirmed clean afterward — the model briefly narrates "using
   systematic-debugging" out of habit (one line) but makes no actual `Skill` tool call, and goes
   straight to a sensible `TaskCreate`-based breakdown instead.

**Real, confirmed obstacle:** TokenReply's free/Trial tier rate-limits aggressively — HTTP 429
roughly every 5-10 tool calls, with a 60s auto-retry backoff built into the SDK (up to 10
attempts). This is a genuine practical limitation on the free tier, independent of how lean the
run itself is. Untested whether a paid Plus tier removes it.

**Cost data — and a real methodology finding:** the Agent SDK's own self-reported
`total_cost_usd` / per-model cost estimate is **unreliable for third-party models** routed
through a custom base URL. One run reported `total_cost_usd: $1.39` from the SDK; TokenReply's
own real billing dashboard showed actual per-request costs of ~$0.007-0.008 each, and ~$0.22
total account spend for the *entire day* of spiking (many runs). The SDK marks this explicitly —
`"costBasis": "unknown"` on the model-usage entry — meaning it silently falls back to some
internal default cost table (likely calibrated for real Anthropic models) rather than the
gateway's actual rate. **Lesson for any future work touching this: always read real cost from
the provider's own dashboard/API, never trust the SDK's self-reported dollar figure for a
non-Anthropic model.**

Real TokenReply pricing observed for `kimi-k2.7` (Trial tier, likely the same base rate under
Plus): $0.95 input / $4.00 output / $0.19 cache-read, per 1M tokens — genuinely cheap, on the
order of a few cents per real task once the Skill-tool overhead is excluded.

**Model/context note:** the TokenReply route used here (`kimi-k2.7`, free-tier accessible via
"Weekly Featured") caps at 200K context — smaller than the 1M context Chutes advertises for
`kimi-k3` directly. A real capability difference between providers/tiers, not just cost.

## Companion idea: cost-comparison feature

Once a task can run through more than one gateway, show what it actually cost via that gateway
**vs.** what it would have cost running natively in Claude Code (Anthropic's own pricing) — turn
"switch providers" into a quantified decision instead of a guess. Building block: use the SDK's
token *counts* (input/output/cache — these are reliably reported) and apply the correct pricing
table for each side yourself (the gateway's real rate + Anthropic's own current rate), rather
than trusting either side's self-reported cost figure — per the methodology finding above.

## Companion idea: run multiple gateways in parallel

Rather than only switching between gateways one at a time, support dispatching the same task
through more than one gateway simultaneously (e.g., Chutes and TokenReply in parallel) — for
direct comparison (cost, quality, speed) rather than a serial pick-one choice. Raised
2026-08-28; not yet scoped how this would actually work operationally (same task run twice and
diffed? Just for cost-metering purposes on one real dispatch? Unclear.)

## Companion idea: two separate benchmark axes

Raised 2026-08-28, refined across several follow-up messages the same conversation. Two
genuinely different comparisons, both worth having, neither a substitute for the other:

**1. Harness benchmark — Claude Code vs. OpenCode.** K.2 currently uses OpenCode
(purpose-built multi-provider agentic coding tool, no DigiSmith/Superpowers scaffolding
baggage) to drive a third-party model. This spike used the Claude Agent SDK instead (Claude
Code's own harness, which — as found above — inherits the *full* Superpowers skill-invocation
instruction set unless explicitly excluded). Worth a real benchmark comparing the two harnesses
head-to-head on the same task/model/gateway: token overhead, reliability, cost, and whether
Claude Code's richer built-in tooling (Task tracking, etc. — visibly used unprompted in the
spike's cleaner run) is worth its scaffolding tax once that tax is properly excluded.

**2. Vendor benchmark — Chutes vs. TokenReply vs. future gateways.** A different axis entirely:
holding the harness constant and comparing gateway providers against each other directly.
Dimensions raised explicitly: **models offered**, **token price**, and **quality** (output
correctness/reliability, not just cost) — the same three the cost-comparison companion idea
above only partly covers (that one compares gateway-vs-native-Claude-Code cost; this one
compares gateway-vs-gateway across all three dimensions).

Both axes probably want the same underlying harness (whichever one/ones this feature ends up
supporting) run against a small fixed set of real tasks, so results are actually comparable
rather than anecdotal — same spirit as the seeded-bug smoke tests used throughout this project's
own SDD builds, just repeated across the cells of a vendor × harness (or vendor × model) grid
instead of once.

## Out of scope / open questions, not yet decided

- Whether this generalizes K.2's existing `offload-implementer` skill, or becomes a separate
  skill/map item entirely that K.2 could optionally sit on top of.
- Whether "AI Gateway Vendors" is the right scope boundary, or whether the harness-comparison
  companion idea (Claude Code vs. OpenCode) actually belongs under a different letter — it's a
  different axis (which coding-agent harness) than gateway choice (which model provider).
- TokenReply account creation/payment is the user's own action, never DigiSmith's — same
  standing boundary as Chutes credential handling elsewhere in this project.
- Whether a paid TokenReply tier actually removes the rate-limiting seen on Trial.

## Why not applied yet

Purely raw material from a same-day exploratory spike and a live conversation that kept
generating adjacent ideas. No brainstorm, no design, no scope decision yet — captured here so
none of it gets lost before a real brainstorming pass happens.
