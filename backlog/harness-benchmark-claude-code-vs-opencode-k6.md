# Harness benchmark: Claude Code vs. OpenCode (K.6)

**Status:** Not applied. Idea only.

**Map item:** **K.6**, sibling to [K.3](ai-gateway-vendors-k3.md) under **K** ("Model tiering").
Independent of K.3's own scope (this is the *coding-agent harness* axis, not the *model gateway*
axis) — doesn't strictly depend on K.3 shipping first, but shares its spike evidence.

**Source:** 2026-08-28, same conversation as K.3.

## The idea

K.2 currently uses OpenCode (purpose-built multi-provider agentic coding tool, no
DigiSmith/Superpowers scaffolding baggage) to drive a third-party model. K.3's spike used the
Claude Agent SDK instead (Claude Code's own harness) — which, per K.3's own two gotchas, inherits
the *full* Superpowers skill-invocation instruction set unless explicitly excluded via
`disallowedTools: ["Skill"]`.

Worth a real benchmark comparing the two harnesses head-to-head on the same task/model/gateway:
token overhead, reliability, cost, and whether Claude Code's richer built-in tooling (Task
tracking, etc. — visibly used unprompted in K.3's spike once the Skill-tool overhead was
excluded) is worth its scaffolding tax once that tax is properly excluded.

## Building on K.3's spike evidence directly

- Claude Code + Kimi K2.7, `Skill` tool excluded: 1,162 output tokens, ~$0.007-0.008/turn real
  cost, clean fix → test → commit cycle.
- OpenCode + Kimi K3 (K.2's own original spike, 2026-08-27): also proved reliable, no
  DigiSmith-scaffolding overhead by construction (OpenCode never had it to begin with).
- Not yet compared head-to-head on the *same* model/task/gateway — the two spikes used different
  models (K2.7 vs K3) and different gateways (TokenReply vs Chutes), so today's numbers aren't a
  clean apples-to-apples harness comparison yet, just two independent existence proofs.

## Open questions

- What does "worth its scaffolding tax" actually mean quantitatively — is there a real quality
  or reliability edge from Claude Code's richer built-in tooling that OpenCode lacks, or is it a
  wash once the Skill-tool tax is removed?
- Same fixed task set as [K.7](gateway-vendor-benchmark-k7.md) for comparability, per that file's
  own note.

## Why not applied yet

Idea only, no design, no head-to-head run yet.
