# `report-implementation`'s only source of truth gets deleted by the very next step it feeds into

**Status:** Not applied. Confirmed live 2026-09-11, shipping K.4 (token counter). Process/design
gap, not a code bug — nothing in `digismith:report-implementation` or
`digismith:subagent-driven-development` malfunctioned; the two skills just aren't sequenced
against each other by anything but the controller's own memory.

## What happened

`digismith:subagent-driven-development`'s Finish step, once the final whole-branch review comes
back clean, does two things in order: delete the plan's workspace (`rm -rf
.superpowers/sdd/<plan-basename>/`, which holds the ledger at `progress.md`), then invoke
`digismith:finishing-a-development-branch`. `digismith:report-implementation` is a **separate**
skill, triggered by its own description ("right before that skill's own Finish step deletes the
plan's workspace") rather than being a literal sub-step SDD's own `SKILL.md` invokes by name.

While executing K.4, the controller ran Finish's `rm -rf` first and only realized afterward —
prompted by a direct question from Jack ("did you update the history?") — that
`report-implementation` had never been invoked. By that point the ledger it depends on (Step 1's
"A ledger must exist at `.superpowers/sdd/<plan-basename>/progress.md`" prerequisite) was already
gone.

## Why this is worse than a missed report

`report-implementation`'s own stated value is exactly this scenario: producing a report "a
cold-start agent with no conversational memory of the feature must be able to produce... from the
plan file, the ledger, and `git` alone" (Step 2a). The ledger is the thing that's supposed to
survive context loss. But the ledger's actual lifetime is bounded by SDD's own Finish step, which
deletes it — so if report-implementation doesn't run **before** that deletion, its only real
recovery path stops existing.

This time, recovery worked anyway: the controller session hadn't been compacted, so every ledger
line was still sitting in its own conversation history and could be retyped verbatim. That's a
lucky accident of timing, not a designed safety net — a controller resuming after a **compaction**
that landed after the `rm -rf` (a documented, expected occurrence per SDD's own "conversation
memory does not survive compaction" warning) would have no way to reconstruct the ledger at all.
`git log` alone doesn't carry per-task review verdicts, deferred-minor rulings, or fix-round
counts — that's precisely the information the ledger exists to hold that commit messages don't.

## What a fix would need (not designed here)

A few directions, none evaluated in depth:

- Make `digismith:subagent-driven-development`'s own `SKILL.md` literally invoke
  `report-implementation` as a named sub-step of Finish, immediately before the `rm -rf` line —
  removing the controller's memory as the only thing enforcing the ordering.
- Have Finish's `rm -rf` step check for a sibling `report.html` first and refuse (or at least loudly
  flag) deleting the ledger if one doesn't exist yet at the expected `.digismith/docs/<slug>/`
  path.
- At minimum, cross-reference the two skills' docs explicitly — `report-implementation`'s own
  "When to Use" section already names the exact trigger moment; SDD's `SKILL.md` doesn't currently
  point back the other way.

## Why not applied yet

Found live, mid-incident, not designed as a fix — needs its own look at
`digismith:subagent-driven-development`'s `SKILL.md` (not touched here) to decide which of the
above (or something else) fits best, and whether the same gap exists for `digismith:executing-plans`'
hand-off to `finishing-a-development-branch` (that path has no `rm -rf` at all per
`report-implementation`'s own docs, so it may already be safe — not verified here).
