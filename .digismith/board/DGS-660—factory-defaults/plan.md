# DGS-660 plan: factory defaults (empty Mode = Autonomous, empty Sign-off = Auto, milestone never blocks)

Rule (decided by Jack): a claim needs spec + plan on the ticket, no open blocker, Mode not Manual. Empty Mode = Autonomous. Empty Sign-off = Auto. Milestone never blocks.

Setup: `pnpm install --frozen-lockfile` inside the worktree only.
Test command: `cd packages/cli && pnpm exec vitest run src/autonomous`

Where the old rule lives (grep on `mode`, `signOff`, `milestone`):
- `ready.ts`: REASON.signOff, REASON.milestone, REASON.mode (lines 10-13, 31-35).
- `scan.ts:79` (`signOff ?? "Jack"`), `scan.ts:205` (`mode !== "Autonomous"`), `scan.ts:39` and `:199` (comments), `scan.ts:217` (dry-run mode verdict).
- `schedule-release.ts:23` (SCHEDULE_TEXT.noMode), `:15` (verdict `no-mode`), `:77` (no-mode stop).
- `tracker-clickup.ts:87`: only an explicit Autonomous hit is read in full. An empty Mode would get a light read (no attachments) and fail spec+plan. Must read full unless Manual. `milestone()` (:120) can throw on a failed list read: it must never fail a scan.
- `types.ts:18-20` (comment on light reads), `index.ts:223` (scan help text).
- `WATCHDOG.md:9,11` (ticket flow). `packages/cli/README.md` has no ready list. `fake-tracker.test-util.ts` default stays.

Protected paths touched (all of `packages/cli/src/autonomous/`): ready.ts, scan.ts, schedule-release.ts, tracker-clickup.ts, types.ts, index.ts, WATCHDOG.md and their tests. The merge needs the Maestro.

### Task 1: ready.ts and scan.ts (the rule)
Tests first (`ready.test.ts`, `scan.test.ts`):
- `ready.test.ts`: "empty Sign-off passes", "no milestone passes", "empty Mode passes"; "Mode Manual fails with the Mode reason only"; REASON.mode pinned to "Mode is Manual"; the all-fail case drops signOff/milestone/mode-null reasons.
- `scan.test.ts`: "a to do ticket with no Mode is claimed" (replaces the no-Mode skip test); "no Sign-off claims with Auto" (order says Sign-off: Auto); "no milestone claims" (replaces the two milestone-skip tests); "Manual is skipped"; "explicit Jack stops at acceptance" (order has the Sign-off: Jack section); dry-run verdicts updated.
Code: `ready.ts` drops the two reasons, mode reason only for `Manual`, text "Mode is Manual". `scan.ts:79` `?? "Auto"`; `scan.ts:205` skip only `mode === "Manual"`, `notAutonomous` renamed `manual`; comments fixed.
Commit: `feat(autonomous): claim on empty Mode, Sign-off and milestone`

### Task 2: tracker-clickup.ts, schedule-release.ts, types.ts
Tests first:
- `tracker-clickup.test.ts`: "a hit with no Mode is read in full (attachments present)" (replaces the light-read test); "Manual hit stays a light read"; "a failed milestone list read gives milestone null and does not fail the read".
- `schedule-release.test.ts`: "empty Mode moves like Autonomous" (replaces the four no-mode cases: moved, would-move in dry run, no comment); drop SCHEDULE_TEXT.noMode pin.
Code: `tracker-clickup.ts:87` light read only for `=== "Manual"`; `milestone()` catches the list error and returns null (cache still cleared on failure). `schedule-release.ts` removes the `no-mode` verdict, text and stop. `types.ts` comment: only Manual is a light read.
Commit: `feat(autonomous): empty Mode is Autonomous in the tracker and the schedule release`

### Task 3: docs and help
- `WATCHDOG.md` ticket flow: new Definition of Ready (spec + plan, no open blocker, Mode not Manual; empty Mode = Autonomous, empty Sign-off = Auto, milestone tracking only).
- `index.ts:223` scan help: "scan to do (any Mode but Manual) and claim ...". Update `index.test.ts` if it pins the text.
- Full run of `src/autonomous`, then the whole package suite.
- DGS-488 comment with the new rule: written at merge by the conductor through dg (no live ClickUp call by the Builder).
Commit: `docs(autonomous): state the new Definition of Ready`

First use (conductor, after merge and install): `dg autonomous scan --dry-run --repo <main checkout>` shows DGS-652 and DGS-654 as `ready` (reasons []) and the Manual tickets (DGS-571, 653, 655, 656) skipped with "Mode is Manual".
