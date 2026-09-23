# sdd-workspace derives every plan's workspace dir as the same literal `plan`

**Status:** Not applied. Confirmed live, 2026-09-23, during T.2's own SDD run — didn't block this
run (no concurrent plan in this worktree), but the underlying logic is wrong regardless.

## What happened

`skills/subagent-driven-development/scripts/sdd-workspace` derives its workspace directory name
via `slug=$(basename "$plan" .md)`. Every plan file, under both the old flat docs convention
(`.digismith/docs/<slug>/plan.md`) and the new nested one (`.digismith/docs/T/T.1-<slug>/plan.md`,
shipped by G.3), is literally named `plan.md` — so `basename` always resolves to the same string,
`plan`, regardless of which feature the plan is for. Every plan in a given worktree/checkout
resolves to the identical workspace: `.superpowers/sdd/plan/`.

This isn't new behavior from G.3 — plan files were always named `plan.md` even under the old flat
convention — but nobody had two plans active in the same checkout at once, so it never surfaced.

## Why it matters

The skill's own setup instructions say: "A ledger whose first line names a different plan file...
is another plan's progress: leave it in place and start your own, fresh." That instruction assumes
each plan gets its own workspace path so "start your own, fresh" means a different directory. It
doesn't — a second plan in the same checkout, run after or during a first, resolves to the exact
same `.superpowers/sdd/plan/` directory the first one owns. In practice this mostly self-heals
(the Finish step `rm -rf`s the workspace once a plan completes, so sequential plans just reuse an
already-emptied directory) — but two plans active *concurrently* in the same worktree checkout
would silently share one ledger and one set of task briefs/reports, exactly the cross-contamination
this script's own doc comment says it exists to prevent.

## Suggested shape (not yet decided)

Derive the slug from the plan's *parent directory* instead of the plan file's own basename —
`.digismith/docs/T/T.1-wire-standards-into-generated-artifacts-t2/plan.md` → `T.1-wire-standards-into-generated-artifacts-t2`,
or the old flat `.digismith/docs/<slug>/plan.md` → `<slug>`. Falls back to the current basename
behavior only for a plan that isn't inside a docs folder at all (e.g. Superpowers' own default
`docs/superpowers/plans/YYYY-MM-DD-<feature>.md` naming, which already encodes uniqueness in the
filename itself).

## Why not applied yet

Didn't block this run — surfaced and recorded rather than fixed under T.2's own unrelated
momentum, per the same pattern the rest of this backlog uses.
