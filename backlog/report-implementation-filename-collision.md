# `report-implementation`/`writing-plans` always target `report.html`/`plan.md`, colliding when a feature slug gets reused

**Status:** Not applied. Confirmed live 2026-09-18, shipping the Screenshots/Videos section
addendum under Q.1. Process/design gap, not a code bug.

## What happened

The original Q build (`generate-comment`, 5 tasks, Q.1 + Q.2) already occupies
`.digismith/docs/generate-comment/plan.md` and `report.html`. When a later, smaller addendum to
the same map item (the Screenshots/Videos section) reused that same feature slug — correctly, per
`writing-plans`'/`report-implementation`'s own guidance to keep working on the same slug rather
than inventing a new one for incremental work — both `writing-plans` and `report-implementation`
tried to write to those exact same filenames again.

`report-implementation`'s own Step 4 has an explicit safety net for this ("If a file already
exists at that path, ask via `AskUserQuestion` before overwriting it — never silently clobber"),
which is what actually caught it live. But `writing-plans` has no equivalent check at all — it
would have silently overwritten the original 5-task `plan.md` with the addendum's much smaller
plan had the same ad hoc dodge (a manually-chosen distinct filename,
`plan-screenshots-section.md`) not been applied there too, this time with no gate forcing the
question.

## Why the current "fix" is fragile

The only thing that happened was a live `AskUserQuestion` catching the `report.html` collision,
followed by picking an ad hoc filename (`report-screenshots-section.html`,
`plan-screenshots-section.md`) matching no documented convention — just improvised to match each
other. Nothing else in either skill knows this convention exists, so:

- `report-implementation`'s Step 4 only asks when the *exact* literal `report.html` already
  exists — it has no concept of "this slug already has one build, name the new one distinctly and
  consistently."
- `writing-plans` has no overwrite-detection at all for `plan.md` — this specific incident got
  lucky only because the report collision was caught first and the same ad hoc pattern got reused
  for the plan by hand, not because anything in `writing-plans` itself would have caught it.
- The `03-history-update.md` post-finish hook (Y.1.3) only recognizes the literal path
  `.digismith/docs/<slug>/report.html` when scanning a merge range for shipped-feature reports
  (per its own script, matching only that exact filename) — an ad hoc report filename like
  `report-screenshots-section.html` is invisible to it, so the addendum's Timeline entry had to be
  added by hand too, with no automated detection at all.

## Suggested shape (not designed here)

Derive report/plan filenames from the actual map sub-item being shipped, mechanically, rather
than always the bare `report.html`/`plan.md` — the plan's own H1 header already carries this
(`# <Title> (<Map Item>) Implementation Plan`), and `report-implementation`'s Step 2a already
parses `{{MAP_ITEM}}` out of it for display; the same value could drive the filename too, e.g.
`report-q1.5.html`/`plan-q1.5.md`, collision-free by construction as long as sub-items are
numbered distinctly. Needs a few things actually designed, not assumed:

- What happens for a build with no clean map sub-item number at all (a pure addendum like this one
  that never got assigned its own Q.1.x/Q.5/etc. — worth cross-referencing whether *this*
  incident argues for always assigning a real sub-item number to anything landing in an
  already-used slug, rather than "addendum" prose with no number, which is exactly what made this
  filename ambiguous to begin with).
- Whether `03-history-update.md`'s scanning script should match a pattern
  (`report*.html`) instead of the exact literal filename, so ad hoc/derived names still get picked
  up automatically instead of needing a manual Timeline entry.
- Whether the same fix should apply to `design.html` addenda (this incident edited the *existing*
  `design.html` in place with an "Addendum" section rather than creating a second design doc —
  a different, arguably fine pattern that this backlog item doesn't challenge, just noting the
  inconsistency: design docs get addended in place, plans and reports get parallel ad hoc files).

## Why not applied yet

Found live, mid-incident, not designed as a fix — needs its own brainstorm to pick a real
convention (derived filename vs. per-build subfolder vs. something else) and decide whether
`03-history-update.md`'s matching also needs to change to keep automated Timeline detection
working once report filenames stop being a single fixed literal.
