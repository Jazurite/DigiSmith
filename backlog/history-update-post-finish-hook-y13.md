# Post-finish hook that updates `.digismith/history.html` (Y-lineage, a third stock hook)

**Status:** Idea only. No design yet — raised by Jack 2026-09-11 right after V.3 shipped,
when `history.html` turned out not to have been touched by that build and, on inspection,
by any build since 2026-08-27. Prerequisite done first, by hand: the page was backfilled
the same day (map badges, Build Order, stats, and every missing timeline entry through V.3),
so this hook only ever has to keep it current, never catch it up.

**Source:** The page's own callout says "Update it whenever a map item ships … flip the
status badge, add a timeline entry." Nothing enforces that. Every feature since I.1's REST
migration (W.2–W.7, W.4.1, Y.1, H's reuse as Preferences, Q's reuse as Templating,
I.4, K.3/K.6/K.9/K.4, V.1/V.2, G.2, the `publish_artifact` retirement, V.3) shipped with
`MEMORY.md` updated and `history.html` not — the map-row edit is in every plan's finish
step, the history entry is in none. Same failure shape as the manual plugin-version bump
that **W.4.1** → **Y.1** fixed: a required-but-unenforced finishing chore that gets missed
the moment attention is elsewhere.

## The idea

A third stock hook at `.digismith/hooks/post-finish/03-history-update.md`, gated on
DigiSmith's own repo exactly like `01-version-bump.md` and `02-plugin-reinstall.md`, that:

- appends one `<div class="event">` timeline entry for the feature that just merged —
  dated, titled from the merged feature's `{{FEATURE_TITLE}}`, body drawn from the same
  sources `report-implementation` already derives its Summary from (the plan's `Goal:` /
  `Architecture:` lines plus the merged range's commit subjects), linking that feature's
  `design.html`/`plan.md`/`report.html`;
- flips the matching map-row badge (and the Build Order cell) when the feature closes a
  letter or sub-item — probably driven by the `{{MAP_ITEM}}` the report already computes;
- bumps the header's "Last updated" date;
- commits and pushes in its own commit (`docs(history): …`), since it fires after
  Option 1's own push, exactly as `01-version-bump.md` does.

## Open questions, not yet scoped

- **Source of truth.** The SDD ledger is already deleted by the time `post-finish` fires,
  so the hook can't read it. `.digismith/docs/<slug>/report.html` survives and already
  contains the summary, per-task table, and commit list — parse that, or have
  `report-implementation` also emit a small machine-readable sidecar the hook consumes?
- **Which slug just merged.** `post-finish` knows the base branch and `ORIG_HEAD`, not the
  feature slug. Derive it from the merged range (the newest `.digismith/docs/<slug>/` touched
  by `ORIG_HEAD..HEAD`), or have `finishing-a-development-branch` pass it through.
- **Badge flipping is judgment, not mechanics.** "Does this merge close letter K?" isn't
  derivable from a diff. Probably: always append the timeline entry (mechanical), only
  *suggest* the badge flip and let the agent following the hook decide — matching how
  `01-version-bump.md` decides BUMPED vs SKIPPED from real evidence rather than guessing.
- **Direct-to-main gap.** Same stranding as `backlog/post-finish-hooks-direct-push-gap.md`:
  a docs-bookkeeping commit pushed straight to `main` never fires `post-finish`, so those
  changes still won't get a timeline entry. Acceptable (bookkeeping isn't a map item) but
  worth stating in the design.
- **Ordering vs. `02-plugin-reinstall.md`.** History is docs-only and doesn't affect the
  plugin cache, so `03-` after the reinstall is fine; confirm it also doesn't need to run
  before `01-`'s version-bump push (it shouldn't — separate files, separate commit).

## Why not applied yet

Idea captured verbatim right after the manual backfill. Needs its own
`digismith:brainstorming` pass — the open questions above (especially source-of-truth and
slug derivation) are real design decisions, not implementation details.
