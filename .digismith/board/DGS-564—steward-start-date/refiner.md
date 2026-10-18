# DGS-564 Refiner output (checkpoint 3)

Text only. No ClickUp writes. The Maestro sets the Sign-off field and Jack moves the status.

## Build tickets

One build ticket: **DGS-564 itself**. It holds the spec (`design.html`) and the plan (`plan.md`, 5 tasks, one commit each). No subtask is needed.

| # | Title | Plan tasks | Size | Depends on |
|---|---|---|---|---|
| DGS-564 | Steward: repair the dates at every event; merged never stops on ITEM_238 | 1, 2, 3, 4, 5 | S | none (DGS-549 and DGS-551 are merged) |

Why one ticket and no split:
- All five tasks change two files in one folder (`steward/event.ts` and its test) and the README. They share the same functions, so they run in order, not side by side.
- Each task is small (one rule, its tests, one commit), so each task review has a small diff file. That is the role-mode reason to cut tasks, and it is done inside the ticket.
- Two workers on one file would collide. A split for the ticket count is not the aim.
- The build runs in role mode: `DIGISMITH_REVIEW_MODE=role`. The Builder never reviews. After each task it runs `dg reviewer pack` and reports `STOP: task-review-ready`; after the last task `STOP: ticket-review-ready`. The ticket key for every pack is `DGS-564` (the `**Key:**` line of `ticket.md`).
- **After the merge, the merge order includes the rebuild of `dist`:** `pnpm --filter @digismith/cli build` in the main checkout, then refresh the global `dg` as the runbook says. Check that the global `dist/steward/event.js` contains `could not repair the start date`. The first use is the next dependent ticket that goes through `started` and done: its start is the day the work began and start <= due.

Not part of this ticket: changing the ClickUp setting "Reschedule dependencies" (Jack keeps it ON), a timer or watcher, a `dg` command that reads ClickUp automations (a tool gap; ticket it only if Jack wants it), DGS-563 (the spike that reads these dates).

## Ranking

One ticket. It can start as soon as Jack moves it to `to do`. It needs the Reviewer seats free (Workbox runbook, "Start of a Reviewer"). The Steward moves of other tickets keep working during the build: the global `dg` changes only at the rebuild.

## Definition of Ready

- [x] Spec approved by Jack (checkpoint 1, relayed by the Maestro, with "Reschedule dependencies stays on"): `design.html`
- [x] Plan written and approved by the Maestro (checkpoint 2, with the change "repair at every event, even when the status is already there"): `plan.md`
- [x] Decided, not open: cause = most likely Reschedule dependencies (unverified; Jack keeps it ON, so the fix coexists); time zone UTC+7 and automations ruled out by Jack; the repair rules (late start becomes today in progress or later; start <= due at done; a missing start filled with the day the ticket entered in progress (state log), else today); one ITEM_238 retry with start = due; a failed repair is a warning, never a block
- [x] No open question for a Builder. Each task has its test code, its commands and its expected result
- [x] The old path is protected: the existing steward tests stay as they are; a Builder fixes test data only if an old snapshot is in progress or later with no start date (it gets `startDate: "2026-10-01"`)
- [x] No ClickUp write by a test (tests use `FakeTracker`)
- [x] The post-merge `dist` rebuild and its check are in the plan ("After the merge") and in this output, for the merge order
- [ ] Jack moves DGS-564 to `to do`

## Sign-off (proposal)

- **DGS-564: unmarked** (no Sign-off value). Internal tooling: the Steward's date rules, with tests and a README note. No look, wording for users, personal data or public surface, so Jack's acceptance is not needed. It is not Auto, because done waits for the first use: at merge the Steward only records the merge and the ticket stays in `review`. After the rebuild and the first use are seen (a dependent ticket through `started` and done keeps start <= due, and the global `dist` holds the new code), `verified` moves it to done.

Jack confirms the choice when he approves into `to do`.

## Refinement end mark

Refinement ended 2026-10-18 22:43 UTC+7 [2026-10-18T15:43:15Z]. Checkpoint 3 approved by the Maestro, with the missing-start repair and the unmarked Sign-off. Waiting for Jack's `to do` decision. No build.
