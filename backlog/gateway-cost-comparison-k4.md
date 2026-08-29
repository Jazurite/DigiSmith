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
- Where would this actually surface — in the offload skill's own report, or a separate
  DigiSmith-level view?

## Why not applied yet

Idea only, no design. Depends on K.3 shipping first.
