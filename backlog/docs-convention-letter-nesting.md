# G.3 Dynamic Doc Conventions — per-letter nesting, configurable per repo, also resolves the report/plan filename-collision gap

## Status

Raised 2026-09-19 during U.1's own brainstorm; merged 2026-09-19 with a same-shaped gap found
2026-09-18 (originally its own file, `report-implementation-filename-collision.md`, now folded in
below) once it became clear both are the same underlying decision hit from two different angles.
Not yet a repo-wide decision — piloted on U.1 alone first
(`.digismith/docs/U/U.1-formatstructure/design.html`), every other existing feature folder (V.4,
V.5, I.6, etc.) stays on the current flat `.digismith/docs/<slug>/` shape unchanged. This file
records the merged proposal and its scope so whoever picks it up next doesn't re-derive it from
scratch.

**Map item:** **G.3**, "Dynamic Doc Conventions" (Methodology) — not **I** (Reporting;
that lineage is external notification channels, not DigiSmith's own doc structure), not **H**
(Preferences) or **O** (Profiling; either might end up *hosting* this item's per-repo toggle as an
implementation detail, but neither owns the docs-convention question itself). **G.2.1** (filed the
same day: connecting a diagramming tool to replace ad-hoc inline-SVG in DigiSmith's own generated
docs) is the closest existing precedent — same category of concern, DigiSmith's own doc output, not
per-repo behavior.

## The core idea, and why it resolves both gaps at once

The unified docs convention (adopted 2026-08-08, see `MEMORY.md`'s Conventions section) currently
puts every feature's docs at `.digismith/docs/<feature-slug>/{ticket.md, design.html, plan.md,
report.html}`, flat, one folder per feature, no grouping by map letter, and no way to distinguish
two separate builds that land under the same slug.

Jack's request during U.1: nest by map letter instead — `.digismith/docs/<Letter>/<Letter.N>-<slug>/`
— so every sub-item of a multi-part letter (U, V, K, W, etc.) sits together under its own parent
folder instead of scattered across the flat namespace by slug alone.

**This is the same fix as the filename-collision gap below, not a separate one.** If every real
build — including an addendum to an already-shipped feature, not just its first pass — gets
assigned its own distinct `<Letter.N>` sub-item number and thus its own folder, there is never a
shared `plan.md`/`report.html` for two builds to collide over in the first place. The
filename-collision incident's own "Suggested shape" section independently arrived at exactly this
conclusion ("worth cross-referencing whether *this* incident argues for always assigning a real
sub-item number to anything landing in an already-used slug") before either item knew the other
existed.

**The default stays flat, for compatibility.** Existing folders are frozen historical record (same
precedent as never editing a shipped `design.html`/`report.html` after the fact) — migrating
V.4/V.5/etc. into the new nested shape retroactively is explicitly out of scope; only new work
opts into nesting. "Configurable per repo" was Jack's own phrasing answering the scoping
question — this convention also governs consumer repos (`digismith:jira-intake`'s
gitignore-vs-commit choice lives beside it), so whatever shape wins needs a per-repo opt-in/toggle
story, not a single global flip.

## Confirmed live gap #1 (2026-09-19, during U.1's own `report-implementation` run)

`digismith:report-implementation`'s Step 1 slug-derivation guard has exactly two cases: the plan
sits directly under `.digismith/docs/<slug>/plan.md` (parent dir is the slug), or it doesn't (fall
back to parsing `<date>-<slug>-plan.md` out of the filename, the old pre-unified-docs convention).
U.1's own plan at `.digismith/docs/U/U.1-formatstructure/plan.md` matches neither: its parent dir
(`U.1-formatstructure`) isn't directly under `.digismith/docs/`, and its filename is plain
`plan.md`, not `<date>-<slug>-plan.md`. Resolved ad hoc for this one run by treating the slug as
the full `U/U.1-formatstructure` path segment (matching the skill's intent, not its letter) — this
is exactly the kind of call-site check the "Why this is a real decision" section below already
flagged as needing an update, now with a concrete, confirmed instance rather than a hypothetical
one.

**Second confirmed instance, same run:** `.digismith/hooks/post-finish/scripts/update-history.ts`'s
`parseReport()` has the identical single-segment-slug assumption
(`/\.digismith\/docs\/([^/]+)\/report\.html$/`) and failed the same way on the same report path,
exiting non-zero per its own designed "fail loud rather than corrupt history.html" contract. Worked
around by hand for this one entry (computed the same fields the script would have — title, date,
summary, reference links — and appended the Timeline entry manually, matching the file's existing
single-line-paragraph convention). Both call sites need the same fix once this convention question
is actually resolved.

## Confirmed live gap #2 (2026-09-18, shipping the Screenshots/Videos section addendum under Q.1)

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
plan had the same ad hoc dodge (a manually-chosen distinct filename, `plan-screenshots-section.md`)
not been applied there too, this time with no gate forcing the question.

The only thing that happened was a live `AskUserQuestion` catching the `report.html` collision,
followed by picking an ad hoc filename (`report-screenshots-section.html`,
`plan-screenshots-section.md`) matching no documented convention — just improvised to match each
other. Nothing else in either skill knows this convention exists:

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

## Why this is a real decision, not a mechanical rename

- **It's a repo-wide, load-bearing convention**, not per-feature styling. `writing-plans`,
  `report-implementation`, and `brainstorming` itself all read/write `.digismith/docs/<slug>/`
  assuming the flat shape, and `03-history-update.md` assumes the exact literal `report.html`
  filename. Changing it needs those call sites checked, not just new docs written differently.
- **Existing folders are frozen historical record** — see above; only new work adopts whatever
  shape wins.
- **"Configurable per repo"** needs a real toggle location — undesigned: a new
  `profiles/<name>.yml` field, or `.digismith/profile`-adjacent config like `preferences.yml`?
  Both exist as precedent for repo-local config; not decided which fits.

## Open questions for whoever scopes this for real

- Does every existing skill that reads `.digismith/docs/<slug>/` need a lookup step (check nested
  path first, fall back to flat) during a transition period, or does nesting only ever apply to
  brand-new slugs going forward (no ambiguity, since a slug's shape is decided once at creation)?
- Does a single-shot, no-map-letter feature (see `MEMORY.md`'s own open question about
  `{{MAP_ITEM}}` having no derivation rule for one) get a nesting exemption, or does it need its
  own bucket (e.g. `.digismith/docs/_unlettered/<slug>/`)?
- Folder naming: U.1's pilot uses `<Letter.N>-<slug>` (e.g. `U.1-formatstructure`) — is the slug
  still independently meaningful (search/grep-able) or should the numeric prefix alone be
  considered sufficient identification, with the trailing text free-form/shorter than the full
  derived slug?
- **What actually triggers a new `<Letter.N>` rather than reusing an existing one's folder?** The
  Q.1 addendum case argues that *any* distinct build — including an addendum to already-shipped
  work — should get its own number rather than silently reusing the parent slug's folder. Needs a
  real rule, not "use judgment," or the collision this item exists to prevent just recurs one level
  up (two addenda both deciding they're "obviously" the next number).
- Should `03-history-update.md`'s matching (and its backing `update-history.ts` script's
  `parseReport()`, confirmed hitting the identical single-segment-slug regex) change from an exact
  literal path to a pattern, or scan one level deeper for nested folders, so builds under the new
  convention are still picked up automatically instead of needing a manual Timeline entry?
- Should the same nesting/numbering apply to `design.html` addenda too? The Q.1 incident edited the
  *existing* `design.html` in place with an "Addendum" section rather than creating a second design
  doc — a different, arguably fine pattern this item doesn't challenge on its own, just flagging the
  inconsistency: today, design docs get addended in place while plans and reports get parallel ad
  hoc files. If every build gets its own numbered folder going forward, does a design doc still get
  edited in place (living at the *parent* letter level) or does it also move per-sub-item?

## How to apply

Read this file plus U.1's own design doc (`.digismith/docs/U/U.1-formatstructure/design.html`)
before scoping the convention change for real — U.1 is the first concrete data point, not a
decided pattern to copy blindly. The Q.1 incident above is the second, independent data point
confirming the same gap from the opposite direction (collision within a slug, not shape mismatch
across slugs) — both need to inform the final design, not just the more recent one.
