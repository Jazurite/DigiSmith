# DGS-622 implementation report

Date: 2026-10-26 (UTC+7). Branch `DGS-622__run-seat-trigger`, rebased on main `9320aa0b`, 12 commits, head `49fe6224`. Sign-off: Auto (no protected path touched).

## What shipped

- Trigger: Oculus reads `manual`, `night-scan`, `away` or `auto`. `unknown` is gone (type, `TRIGGERS`, derive, fixtures). An automatic run with no order reads `auto`; an automatic builder the scan claimed reads `night-scan` or `away`.
- Key column: `RunsTable` shows the ticket, else the project, else `-`. A probe pane (agent name with "probe") gets project `usage-probe`.
- Seat: new `run/seat.ts` `seatOf`. `DIGISMITH_SEAT` first; else the local part of the login email in `.claude.json`, only when no token variable exists (key presence only, no token value is read). `startAuto` uses it.
- `claude-account env` prints `export DIGISMITH_SEAT=<name>` for a seat and for a gateway (the name only).
- Lifecycle events: new `run/lifecycle.ts`, called from `runHook` for tool events, in its own try/catch. `review_ready` (ticket pack, with round), `merged` (the post-finish pin ref must exist in the repo of cwd), `pushed` (push of main or master, only to merged builder runs of the same git common dir in the last 7 days). A failed tool writes nothing. Event data holds no command text.
- Added beyond the plan, from the ticket review: `commonGitDir` and `refExists` in `repo-info.ts` (fs only), `waitFor` and `toolOk` moved to `events.ts`.
- Baseline: the two PNGs of the story `oculus-runstable--default` (light, dark, desktop) were regenerated with a scoped update, in their own commit. Cells that changed: Key (`-` to `DigiSmith`, `DigiSmith`, `Emma` on the three automatic rows; the column is wider, so the image is 1064 px, was 1028 px) and Trigger (`unknown` to `auto` on the same rows).

## Reviews

Four task reviews (claude-sonnet-5-5) and one ticket review with a scoped second review (claude-opus-5-5). Ticket review r1: two Important and one Minor, all fixed in one wave; r2 clean. The table is in `findings.md`.

## Gates

- `packages/cli` run, oculus, nexus-shared, run-events, nexus-api oculus tests: 317 pass (166 in run and run-events after the fix wave). `claude-account` shell test: 102/102. `tsc` on `packages/cli`: clean.
- Web: unit 392/392; e2e 88 passed, 6 skipped; a11y 515 passed, 1 skipped; visual 238 passed, 210 skipped (after the baseline commit).
- `nexus-web typecheck`: 8 errors, all in `scripts/nexus-api/src/scheduler/` (clock.ts, guard.ts, runlog.ts); the branch does not touch that folder.
- `hook-timing` (assert): overhead SessionStart 25 ms, PostToolUse 24 ms (limit 40). A push scan over a depot of the real size adds no measurable time.

## Next (the conductor)

After the merge: plugin reload, then check Oculus Runs (old automatic rows read `auto`; a no-ticket row shows its project). `scripts/claude-account/install.sh` and the first use are the conductor's (Maestro approval). A pane that was started before the install keeps its old env, so its seat stays `-`. `seatOf` step 2 shows the login name, which may differ from the seat name; first use will show it.
