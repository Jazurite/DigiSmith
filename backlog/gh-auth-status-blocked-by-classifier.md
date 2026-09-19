# Auto-mode classifier blocks read-only `gh auth status`

**Status:** Not applied. Observation only, carried forward from the now-shipped H.2
(`per-repo-git-credential-preference-h2.md`, deleted once H.2's SSH-key half applied — this
side-observation is the part that wasn't resolved by that build).

**Source:** 2026-09-19, same incident that surfaced H.2 — moving a project into `devkit` and
hitting a `gh` CLI account mismatch.

## What happened

`gh auth status` (no `--show-token`, purely read-only — lists which accounts are logged in and
which is active) was blocked outright by the Claude Code auto-mode credential-materialization
classifier, the same as `gh auth switch` was. This made it impossible to even *inspect* which
account was active from inside the session, let alone fix the mismatch — the classifier treated a
read-only status check the same as an actual credential-switching action.

## Why this might be worth its own fix

Blocking `gh auth switch` (an action with real side effects — changes which account every future
`gh` command runs as) is defensible. Blocking `gh auth status` (no side effects, doesn't even
reveal a token) seems like it's erring further than necessary, and made H.2's own root-cause
diagnosis harder than it needed to be.

## Open question, not yet investigated

`backlog/offload-blocked-by-permission-classifier-k.md` (K-lineage) is a related-but-distinct
classifier complaint from a different context (mechanical-tier offload dispatch being refused).
Worth checking whether these are the same underlying classifier behavior applied broadly, or two
coincidentally similar but separate behaviors, before deciding whether a fix (or a report to
Anthropic, if this is host-level classifier behavior DigiSmith has no control over) belongs to one
combined item or two.
