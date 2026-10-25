# DGS-612 report: watchdog false alarms

Ticket DGS-612 (B.6 Bug, High). Branch `DGS-612__watchdog-false-alarms`, order oc-05 (Sign-off: Auto). CLI only: no web file, no hook change.

## What changed
- `classify` (`watchdog.ts`) reads the herdr status of the pane:
  - Pane gone: lost `pane-gone` (kept). Unanswered permission prompt: blocked (kept).
  - R2b: status `blocked` with no prompt event, held 60 s (age of the last event): blocked `pane-blocked`.
  - R3: pane present and idle or done: healthy `waiting`, no silence alarm and no phase budget.
  - R3b: idle or done and silent 4 h or more: stalled `waiting-240-min`.
  - R4/R5: pane present and working: no 30-minute alarm. Silent 3 h: stalled `silent-working-180-min`.
  - R6: pane unknown and silent 30 min: lost `silent-30-min` (kept).
  - R7: the building budget is 180 min (was 45).
- `watch.ts`: a lost item is retry-eligible only for a builder run with cause `pane-gone`. The pass closes open items of a superseded run (a newer run of the same ticket and role), of a finished run (a `merged` event, or a removed worktree) and of a run whose record is gone. It opens nothing for those runs. The 12 items open on 2026-10-25 close on the first watch pass after the update.
- `advance.ts`: a retry targets only the ticket's newest builder run. No retry while the runs read fails. A reviewer or scout item never gives a retry. The adopt action lists the ticket's open retry items.
- Oculus (`oculus/views.ts`, `derive.ts`): runs use the live herdr pane and status (a sync lookup, 15 s cache) instead of "unknown".
- Release commit: the merge order text (`ORDER_TEXTS.merge`) and the `order.ts` usage line tell the conductor to run `dg autonomous release --ticket T --result merged --commit $(git rev-parse HEAD)`. The report already prints the stored commit.

## Tests
- `src/autonomous` plus `src/oculus`: 913 of 913 (44 files).
- Full CLI suite: 2362 of 2364. The 2 failures are in `strip-types.smoke`, a known race: `index.e2e.test.ts` rebuilds `clickup-client/dist` while the suite runs. The smoke test passes 8 of 8 alone, with the dist built.
- Rebased on main (DGS-623 merged, 7e7400e1) before the review. No test needed adapting to DGS-623.

## Review
Five tasks, each reviewed (Tasks 1 to 5: approved, minors fixed or parked). The whole-branch review (opus) found 1 Important (a reviewer or scout item could cause a builder retry, fixed in `def01949`) and 2 Minor (parked). The scoped re-review was clean, with 1 Minor fixed in `12dc0f52`. See `findings.md`.

## Follow-ups (parked)
- A run older than 7 days that never ended is skipped before the closing rules; none of today's 12 items.
- The Oculus pane lookup uses `execFileSync` (3 s timeout, 15 s cache). It blocks only the spawned `dg oculus view` process, not the Nexus server.
- The strip-types smoke test has no retry for the dist race (the Oculus test has one).

## After the merge (the conductor)
Rebuild the CLI dist, run `dg autonomous watch --dry-run` and check the "would resolve" count, then a real pass. The Builder did not rebuild the CLI dist, restart anything or run a watch pass.
