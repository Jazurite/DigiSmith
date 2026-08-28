# Run multiple gateways in parallel (K.5)

**Status:** Not applied. Idea only, depends on K.3.

**Map item:** **K.5**, sibling to [K.3](ai-gateway-vendors-k3.md) under **K** ("Model tiering").
Depends on K.3 (pluggable gateway choice) existing first.

**Source:** 2026-08-28, same conversation as K.3.

## The idea

Rather than only switching between gateways one at a time, support dispatching the same task
through more than one gateway simultaneously (e.g., Chutes and TokenReply in parallel) — for
direct comparison (cost, quality, speed) rather than a serial pick-one choice.

## Open questions, not yet scoped

- How this actually works operationally: same task run twice (once per gateway) and the results
  diffed/compared? Or just for cost-metering purposes layered on one real dispatch?
- If both attempts produce a real commit, which one actually lands — does the user pick, or does
  this stay strictly a comparison/read-only exercise with no side effects?
- Relationship to [K.7](gateway-vendor-benchmark-k7.md) (vendor benchmark) — this may end up
  being the *mechanism* K.7's benchmark runs on top of, rather than a fully separate feature.

## Why not applied yet

Idea only, no design. Depends on K.3 shipping first, and probably wants K.7's benchmark
questions answered before the operational shape is clear.
