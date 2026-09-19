# Extend the unified docs convention: per-letter nesting, configurable per repo

## Status

Raised 2026-09-19 during U.1's own brainstorm. Not yet a repo-wide decision — piloted on U.1 alone
first (`.digismith/docs/U/U.1-formatstructure/design.html`), every other existing feature folder
(V.4, V.5, I.6, etc.) stays on the current flat `.digismith/docs/<slug>/` shape unchanged. This file
records the proposal and its scope so whoever picks it up next doesn't re-derive it from scratch.

## Confirmed live gap (2026-09-19, during U.1's own `report-implementation` run)

`digismith:report-implementation`'s Step 1 slug-derivation guard has exactly two cases: the plan
sits directly under `.digismith/docs/<slug>/plan.md` (parent dir is the slug), or it doesn't (fall
back to parsing `<date>-<slug>-plan.md` out of the filename, the old pre-unified-docs convention).
U.1's own plan at `.digismith/docs/U/U.1-formatstructure/plan.md` matches neither: its parent dir
(`U.1-formatstructure`) isn't directly under `.digismith/docs/`, and its filename is plain `plan.md`,
not `<date>-<slug>-plan.md`. Resolved ad hoc for this one run by treating the slug as the full
`U/U.1-formatstructure` path segment (matching the skill's intent, not its letter) — this is exactly
the kind of call-site check the "Why this is a real decision" section below already flagged as
needing an update, now with a concrete, confirmed instance rather than a hypothetical one.

## The idea

The unified docs convention (adopted 2026-08-08, see `MEMORY.md`'s Conventions section) currently
puts every feature's docs at `.digismith/docs/<feature-slug>/{ticket.md, design.html, plan.md,
report.html}`, flat, one folder per feature, no grouping by map letter. Jack's request during U.1:
nest by map letter instead — `.digismith/docs/<Letter>/<Letter.N>-<slug>/{...}` — so every
sub-item of a multi-part letter (U, V, K, W, etc.) sits together under its own parent folder instead
of scattered across the flat namespace by slug alone.

## Why this is a real decision, not a mechanical rename

- **It's a repo-wide, load-bearing convention**, not per-feature styling. `writing-plans`,
  `report-implementation`, and `brainstorming` itself all read/write `.digismith/docs/<slug>/`
  assuming the flat shape. Changing it needs those call sites checked, not just new docs written
  differently.
- **Existing folders are frozen historical record** (same precedent as never editing a shipped
  `design.html`/`report.html` after the fact) — migrating V.4/V.5/etc. into the new nested shape
  retroactively is explicitly out of scope; only new work adopts it.
- **"Configurable per repo"** was Jack's own phrasing answering the scoping question — this convention
  also governs consumer repos (`digismith:jira-intake`'s gitignore-vs-commit choice lives beside it),
  so whatever shape wins needs a per-repo opt-in/toggle story, not a single global flip. Undesigned:
  where would that toggle live — a new `profiles/<name>.yml` field, or `.digismith/profile`-adjacent
  config like `preferences.yml`? Both exist as precedent for repo-local config; not decided which fits.

## Open questions for whoever scopes this for real

- Does every existing skill that reads `.digismith/docs/<slug>/` need a lookup step (check nested
  path first, fall back to flat) during a transition period, or does nesting only ever apply to
  brand-new slugs going forward (no ambiguity, since a slug's shape is decided once at creation)?
- Does a single-shot, no-map-letter feature (see `MEMORY.md`'s own open question about
  `{{MAP_ITEM}}` having no derivation rule for one) get a nesting exemption, or does it need its own
  bucket (e.g. `.digismith/docs/_unlettered/<slug>/`)?
- Folder naming: U.1's pilot uses `<Letter.N>-<slug>` (e.g. `U.1-formatstructure`) — is the slug
  still independently meaningful (search/grep-able) or should the numeric prefix alone be considered
  sufficient identification, with the trailing text free-form/shorter than the full derived slug?

## How to apply

Read this file plus U.1's own design doc (`.digismith/docs/U/U.1-formatstructure/design.html`)
before scoping the convention change for real — U.1 is the first concrete data point, not a
decided pattern to copy blindly.
