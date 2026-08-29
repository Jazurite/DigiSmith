# W.3 handoff — paused before the final-review fix wave

**Branch:** `worktree-call-site-cutover`, pushed to origin at commit `ea33ac0`.
**Status:** All 8 implementation tasks complete and individually reviewed clean.
The whole-branch final review ran and came back **"Ready to merge? With fixes"**
— the fixes below are NOT yet applied. Do not merge to `main` until they are.

## Why paused here

Session hit its usage limit right after the final review landed, before the fix
wave could be dispatched. Nothing is broken — every task's commit is real and
reviewed; this file exists so a fresh session (possibly on another machine) can
resume without replaying the whole conversation.

## Final review findings — what still needs fixing

### Critical — plugin version was never bumped (blocks this branch from actually working)

The installed DigiSmith plugin cache is version-keyed
(`~/.claude/plugins/cache/jazurite/digismith/<version>/skills/`) and pinned at
`0.13.0-beta` per `~/.claude/plugins/installed_plugins.json`. That cached
snapshot predates **W.1, W.2, K.2, and V.1** — none of `vendored-*`, `depot`,
or `offload-implementer` exist in it. This is a **pre-existing gap across four
already-merged branches**, not something W.3 introduced — but W.3 is the
branch that makes it load-bearing: after this merges, every DigiSmith entry
point says `digismith:brainstorming` / `digismith:finishing-a-development-branch`
etc., and none of those names resolve in the live session until the plugin
cache refreshes. Per `MEMORY.md`'s own W row, "frontmatter name wins over
folder name" is still "not yet live-confirmed" — so there are two unverified
links in the chain, not one.

**Fix:** bump the version in both `.claude-plugin/plugin.json` and
`.claude-plugin/marketplace.json` — current value `0.13.0-beta`, next per the
integer-SemVer-minor convention is `0.14.0-beta`. Then, after merging,
**confirm `digismith:brainstorming` (or any cut-over name) actually resolves
in a fresh session** — treat this as a mandatory post-merge gate, not
optional, per the reviewer's explicit correction of the design's own
"Post-merge live confirmation" bullet (currently phrased as a nice-to-have;
it isn't).

Also worth a **separate backlog item**: the broader pattern of merging a
DigiSmith feature without bumping the plugin version, which has now happened
four times before this one. A "bump version" step belongs somewhere in
`finishing-a-development-branch`'s own flow or DigiSmith's own merge
checklist — not designed here, just flagged so it doesn't recur a fifth time.

### Important — `enforcer/SKILL.md` is now self-contradictory

Lines 10-11 (and the milder line 298) still say `digismith:brainstorming` and
`digismith:writing-plans` "are third-party Superpowers skills with their own
default output locations" — true before this branch, false after it (they're
DigiSmith's own vendored copies now). This is a plan-quality miss (the plan
correctly said "third-party Superpowers skills" is prose, not a token, and
left it alone) rather than an implementation defect, but the sentence needs
fixing regardless.

**Fix:** reword line 10-11 to something like "are DigiSmith's vendored copies
of Superpowers' skills, which still carry their upstream default output
locations" — check line 298 for the same issue and fix if needed.

### Important (scope decision, not yet made) — README.md / docs/getting-started.md

13 occurrences of the old `superpowers:` prefix for the same 6 cut-over
primitives remain in `README.md` (lines 44, 47, 50, 59, 70, 81, 108, 141,
215, 222, 225) and `docs/getting-started.md` (line 64) — outside W.3's
originally planned scope (design/plan only covered `skills/` + `MEMORY.md`).

**Jack was mid-decision on this when the session hit its limit** — asked
whether to fix now (same fix wave) or fast-follow separately, hadn't answered
yet. Ask again when resuming, or use judgment: the mechanical pattern is
identical and already proven safe across 8 tasks, so folding it in is likely
fine, but confirm rather than assume.

### Minor — parked, not blocking, no action required unless convenient

- `design.html`'s own Testing/Verification section still says "expect zero"
  / "expect exactly one" for residual `superpowers:` counts, but the doc's
  own mid-planning-correction callout and classification table already
  documented 2 residuals in each of the two exception spots. Doc-only
  inconsistency in an already-published spec; plausibly the actual root
  cause of one of the three count-arithmetic mistakes made during execution
  (see below). Fix if touching that file again, not worth a dedicated pass.
- `MEMORY.md`'s W.3 status text reads "specced 2026-08-29 (built 2026-08-29)"
  (same date twice) vs. W.2's more compact "specced and built 2026-08-29".
  Cosmetic.
- Surviving prose uses of the word "Superpowers" (not the `superpowers:`
  token) — e.g. `bootstrap/SKILL.md`'s "Superpowers' own chain takes over
  from there", `report-implementation`'s generated-report sentence "Followed
  the full Superpowers process..." — are correctly out of this migration's
  scope (methodology prose, not skill-invocation tokens) but the reviewer
  flagged them as "worth a deliberate decision rather than inheriting by
  default." Not urgent; revisit only if it ever feels wrong in practice.

## Process note (informational, not a fix item)

The plan's own expected-count numbers for verification greps were wrong
three separate times during execution (Tasks 3, 5, 7) — each an arithmetic
slip when hand-tallying multi-token lines, not an implementation defect.
Each was caught (by the implementer or the controller) and independently
re-verified against the actual file state before the corresponding review
was dispatched; all three are resolved and don't block anything. The final
reviewer suggested a process fix for next time: express expected residuals
as literal quoted line sets rather than hand-computed totals, since a total
is arithmetic nobody can verify at a glance and a quoted line set is a plain
comparison. Worth remembering for W.4 and beyond, not something to act on
for this branch.

## What to do next, in order

1. Resolve the README.md/getting-started.md scope question with Jack (or use
   judgment if unavailable — see above).
2. Dispatch ONE fix subagent covering: the version bump, the enforcer
   sentence fix, and (if in scope) the README/getting-started rewrite using
   the same pattern as Tasks 1-6 of this plan's own `plan.md`.
3. Run exactly one scoped re-review of that fix wave.
4. Adjudicate any residual findings (park non-blocking ones with rulings;
   there's no second fix wave after this one).
5. Merge to `main` locally, verify tests/checks on the merged result, push
   `origin/main` explicitly (this repo's own `finishing-a-development-branch`
   Option 1 doesn't push — that's literally the bug map item **W.4** exists
   to fix later — so push is always a separate manual step here).
6. **Do the mandatory post-merge live check**: confirm `digismith:brainstorming`
   (or any other cut-over name) actually resolves as an invocable skill in a
   fresh session, per the Critical finding above.
7. Generate the implementation report (`digismith:report-implementation`
   convention, map item N) before deleting this plan's SDD workspace.
8. Clean up the worktree and branch once merged.

Full detail for all of the above lives in `.digismith/docs/call-site-cutover/plan.md`
(the 8-task implementation plan, already fully executed) and
`.digismith/docs/call-site-cutover/design.html` (the approved design spec).
