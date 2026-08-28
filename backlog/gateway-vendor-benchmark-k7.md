# Vendor benchmark: Chutes vs. TokenReply vs. future gateways (K.7)

**Status:** Not applied. Idea only, depends on K.3.

**Map item:** **K.7**, sibling to [K.3](ai-gateway-vendors-k3.md) under **K** ("Model tiering").
Depends on K.3 (pluggable gateway choice) existing first.

**Source:** 2026-08-28, same conversation as K.3, refined across several follow-up messages
("benchmark two ways between different AI gateway vendors", "compare between models, token
price, quality").

## The idea

A different axis from [K.6](harness-benchmark-claude-code-vs-opencode-k6.md)'s harness
comparison: holding the harness constant and comparing gateway *providers* against each other
directly. Dimensions raised explicitly:

- **Models offered** — what each gateway actually exposes (e.g. TokenReply's 40+-provider
  catalog vs. Chutes' narrower one).
- **Token price** — real per-token cost, read from each provider's own dashboard/API (never a
  harness's self-reported estimate — see K.3's cost-methodology finding).
- **Quality** — output correctness/reliability on real tasks, not just cost. This is the piece
  [K.4](gateway-cost-comparison-k4.md)'s cost-comparison doesn't cover (K.4 is gateway-vs-native
  cost only; this is gateway-vs-gateway across all three dimensions).

## Method, tentative

Both this and K.6 probably want the same underlying harness (whichever one/ones K.3 ends up
supporting) run against a small fixed set of real tasks, so results are actually comparable
rather than anecdotal — same spirit as the seeded-bug smoke tests already used throughout this
project's own SDD builds (K.2's and V.1's own dogfood/smoke tests), just repeated across the
cells of a vendor × model grid instead of run once.

## Open questions

- Relationship to [K.5](gateway-parallel-execution-k5.md) — K.5's parallel-dispatch mechanism
  may end up being how this benchmark actually executes each grid cell, rather than a fully
  separate feature.
- What counts as "quality" concretely — pass/fail on a fixed task suite? A judged rubric? Both?

## Why not applied yet

Idea only, no design, no benchmark run yet. Depends on K.3 shipping first.
