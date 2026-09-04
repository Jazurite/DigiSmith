# Saved merge-vs-PR preference for finishing-a-development-branch

**Status:** Not applied. Captured mid-use of the freshly-activated `finishing-a-development-branch`
(W.4) during W.5's own integration decision — deliberately not implemented on the spot.

**Source:** 2026-09-04, same session as W.4/W.5.

## The idea

`finishing-a-development-branch`'s Step 4 menu (Merge locally / Push+PR / Keep as-is) currently
asks fresh every single time a branch finishes, even though which of Option 1 vs Option 2 a given
context wants is usually predictable — e.g. DigiSmith's own self-work almost always wants Option 1
(merge locally, now that W.4 makes it push too), while ticket work for a client repo almost always
wants Option 2 (PR). Jack's proposal: let this be a saved preference instead of a fresh question
each time — asked once (e.g. at DigiSmith session/ticket start, or on first use in a given repo),
then reused automatically for that context going forward, unless he explicitly says otherwise for
a specific run.

## Why not applied yet

Captured verbatim per the same "write it down, don't build mid-flight" pattern used earlier this
session for K.8, X, and W.6 — this surfaced while `finishing-a-development-branch` was actively
being used to finish W.5 itself, and expanding its scope again mid-use would repeat exactly the
mistake W.5's own scope-creep moment (H's retirement) was deliberately deferred to avoid.

## Open questions, not yet scoped

- Where does the saved preference live — a new field in `profiles/<name>.yml` (same shape as
  `task_offload_provider` etc.), or something else?
- Scope of the preference: per-profile (e.g. `digismith`/`jazurite` profiles always merge locally,
  `emma` always PRs), or something finer-grained (per-repo, per-branch-naming-pattern)?
- Still respects the skill's own explicit "wait for their answer, the integration decision is
  theirs" rule and its Common Rationalizations entry against inferring "they obviously want X" —
  a saved preference is different from inferring intent on the fly, but the override path ("unless
  they tell you otherwise") needs a clear, low-friction mechanism so it doesn't become the same
  problem in a different shape.
- This would be another W.6+-lineage activation of `finishing-a-development-branch` itself (a
  second divergence from upstream, on top of W.4's push fix) — or a DigiSmith-side profile field
  `finishing-a-development-branch` reads, similar to how `bootstrap`/`adopt` read profile fields
  today. Not yet decided which.
