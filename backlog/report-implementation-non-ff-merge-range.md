# `report-implementation` (N) assumes fast-forward history — breaks on a real merge commit

**Status:** Not applied. Raw idea only, no design spec yet.

## What prompted it

`digismith:report-implementation`'s own "When to Use" section already flags this as a known,
unaddressed risk: *"This repo's merges are always fast-forward, so the commit range recorded here
won't change once `digismith:finishing-a-development-branch` actually runs. That last point is an
assumption, not a guarantee... re-examine this design the first time that happens."*

That happened live on 2026-09-22 during T.7 (voice-selection). Mid-plan, `main` had to be merged
into the feature branch (a real, non-fast-forward `git merge`, not a rebase) to pick up W.10's
`SessionStart` hook for Task 5 to build against. The ledger's Step 1 instruction — take
`MERGE_BASE` from the ledger's first `Task 1: complete (commits <base>..<head>, ...)` line — still
pointed at the branch's own pre-merge starting commit. Using that base for `git log --reverse
--oneline MERGE_BASE..HEAD` pulled in the *entire* commit history unique to `main` since the
branches diverged: other lineages' work (W.10's own 6 commits, several unrelated backlog/docs
commits from K and H sessions, a plugin version bump) — none of which this branch's own build
process actually did.

## What this covers

`report-implementation` Step 1 needs a real check for whether the branch's history is
fast-forward-clean before trusting the ledger's literal first-task base:

- If `git merge-base main HEAD` (or the repo's actual base branch) equals the ledger's own
  recorded first-task base, the fast-forward assumption holds — proceed exactly as documented
  today.
- If it doesn't (a real merge commit sits somewhere in the range, detectable via `git rev-list
  --merges MERGE_BASE..HEAD` returning anything), the correct base for a meaningful, feature-only
  commit list is `git merge-base <base-branch> HEAD` instead of the ledger's literal string — this
  is the one that actually excludes commits contributed by other lineages that a mid-plan merge
  pulled in.

## Workaround used this time

Manually recomputed `MERGE_BASE` as `git merge-base main HEAD` instead of trusting the ledger's
literal Task 1 base, and noted the substitution plainly in the report's own Summary section (a
`.callout` box) rather than silently deviating. See
`.digismith/docs/voice-selection-t7/report.html`'s Summary section for the exact wording used.

## Why not applied yet

Single live occurrence of a scenario the skill's own docs already anticipated but deferred design
work on ("re-examine this design the first time that happens" — this is that time). No formal
brainstorm run yet on the general fix; the workaround above is manual and per-invocation, not a
change to the skill itself.
