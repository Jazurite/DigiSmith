# Manager triage: rerun a failed CI job once before investigating

**ClickUp:** **DGS-310** (list Imperium, backlog; proposed home in the ticket); key written back by the DGS-165 sweep, 2026-10-10.

**Status:** Idea only, confirmed live once. No design yet.

**Source:** Live session 2026-10-02 (Claude desktop-app session "Main", manager mode: one Claude session managed herdr worker agents on EMKT-791 and EMKT-810). Full retro: [manager-mode-retro-2026-10-02.md](manager-mode-retro-2026-10-02.md).

## What's wrong

On PR emma-sleep/shopify-template-ph#664 the E2E checkout test timed out on
`[data-test='quantity-plus']`. The test picks one of the first 3 products at random. The manager
showed the change could not remove that button (the quantity adjuster is not bundle-gated), and
`gh run rerun <id> --failed` passed. Note: the rerun replays the whole dependent chain (Theme
Build, Live Sync, Ephemeral Deploy), and Live Sync opened and merged a stash PR again.

## The idea

A manager rule: when a CI job fails in code the diff does not touch, rerun it once before
spending time on it, and say "cause not confirmed" if the rerun passes. Keep the first attempt's
logs or artifacts if the rerun also fails.

## Related

[manager-orchestrator-profile.md](manager-orchestrator-profile.md).
