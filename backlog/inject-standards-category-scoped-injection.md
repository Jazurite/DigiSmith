# Category-scoped injection for inject-standards

**Status:** Not applied. Raw idea, surfaced during T.2's brainstorm (2026-09-23) — needs its own
design pass before becoming a plan.

## What this covers

`digismith:inject-standards` today resolves what to inject through content-relevance matching
against `index.yml` descriptions (Step 4), plus scenario-based formatting (Step 2) and a couple of
narrow exclusion rules (`kind: prose` excluded from Scenario 4, the Step 0.5 Voice Gate auto-including
two specific entries in Scenario 1 only). There's no first-class way for a caller to ask for
"just the writing standards" or "just the coding standards" directly — every existing mechanism
either matches by free-text relevance or hardcodes specific entry names (as the Voice Gate does).

T.2 needed exactly this for the writing-standard case and solved it narrowly: `generate-comment`,
`report-implementation`, and `finishing-a-development-branch` each read `ste100-writing` (+
companions) directly, gated by `technical_voice`, rather than going through `inject-standards`'s
suggestion flow. That's a reasonable scoped fix, but it's also a hand-rolled special case of a
more general shape: standards categorized by *purpose* (coding, writing, conversation, ...) that
a caller can request by category rather than by content-relevance guessing or by naming files.

## Why it matters

If a fourth consumer shows up needing "give me the coding standards" or "give me the conversation
standards" on demand, it either duplicates T.2's own direct-read pattern again, or it's the moment
to generalize: add a `category:` field (or reuse/extend `kind:`) to `index.yml` entries, and a new
`digismith:inject-standards` mode that resolves by category instead of by content-match. Worth
scoping properly rather than accreting more one-off direct-read call sites.

## Why not applied yet

T.2 didn't need the general mechanism — a direct, narrowly-scoped read of one standard family was
enough. Captured here so the idea isn't lost, not because it's decided.
