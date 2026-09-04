# Non-fast-forward merges in this repo — re-examine report-implementation's assumption

**Status:** Not applied. A flag for a future pass, not a bug to fix now. Now confirmed twice.

**Source:** 2026-08-27, merging map item K.2 (`implementer-offload`) into
`main`. **Recurred** 2026-09-04, merging map item W.6 (retiring H) into `main`.

## What happened

`digismith:report-implementation`'s own docs state: "this repo's merges
are always fast-forward... If a real merge commit is ever created
instead, the commit range recorded at trigger-time could differ from
what actually lands on `main` — re-examine this design the first time
that happens."

That happened. Merging `worktree-implementer-offload` into `main`
produced a real merge commit (`00292a3`, "Merge branch
'worktree-implementer-offload'") via git's `ort` strategy, not a
fast-forward — because another concurrent Claude Code session had
committed unrelated work to `main` (touching `depot` and
`jira-rest-migration` feature slugs) while K.2 was being built in its
own worktree. Multiple sessions working this repo in parallel today made
this a real, not hypothetical, occurrence.

## Why it didn't actually break anything this time

`digismith:report-implementation` runs and writes `report.html` **before**
the merge happens (it's invoked right after the final review passes, per
its own "before `subagent-driven-development`'s Finish step" trigger
point) — so the commit range it records (`31cbb2c..51f370a`, the feature
branch's own linear history) was already correct and already committed
by the time the merge created `00292a3`. The report's content wasn't
affected. The gap the original design note anticipated — "the commit
range recorded... could differ from what actually lands on `main`" —
didn't materialize here specifically because the report is written
against the *feature branch's* history, not `main`'s, and that part
never changes regardless of how the merge itself resolves.

## Second occurrence (2026-09-04, W.6)

Merging `worktree-retire-h` into `main` produced another real merge commit (`bbcf0ea`, via
`ort`), not a fast-forward — `backlog/README.md` had diverged on `main` independently (an
unrelated `docs(backlog):` commit landed there while W.6 was being built in its own worktree).
Same shape as K.2's occurrence: `report-implementation` had already written and committed
`report.html` against the feature branch's own linear history (`a1a5a1e..89faa5f`) before the
merge ran, so nothing was affected here either. Two occurrences in two unrelated merges is enough
to treat this as the recurring norm the first entry's "still worth examining" bullet already
anticipated, not an edge case — worth actually updating `report-implementation`'s doc comment
next time that skill is touched, rather than leaving it phrased as a hypothetical.

## What's still worth examining

- Whether `report-implementation`'s own doc comment should be updated
  now that this has actually happened once — either to confirm the
  "before merge" design already handles it fine (as observed here), or
  to note explicitly that non-fast-forward merges are now a known,
  recurring possibility (multiple concurrent sessions on this repo is
  the norm, not an edge case) rather than a hypothetical worth flagging
  as unusual.
- Whether anything else in DigiSmith's docs assumes fast-forward-only
  merges the way this one comment did — worth a quick grep for similar
  assumptions before treating this as fully closed.

## Why not applied yet

Purely observational — the actual outcome was fine, nothing broke. Raised
because the original design note explicitly asked to be revisited the
first time this occurred, not because there's a known defect to fix.
