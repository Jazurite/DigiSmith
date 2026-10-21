# DGS-582 Nightwatch ticket state machine: implementation report

Date: 2026-10-22 (UTC+7). Branch `DGS-582__nightwatch-state-machine`. Range `290603e..d428bee` (35 commits). Builder: dgs-582 (herdr, seat dev0, role mode). Spec: `design.html`. Plan: `plan.md`. Findings: `findings.md`. Probe: `probe.md`. Conductor text: `runbook-text.md`. HTML report: `report.html`.

## What shipped

Plain code in `packages/cli/src/autonomous/` holds the state of one unattended ticket: `claimed`, `building`, `review`, `merge-ready`, `merged`, `released`. It moves a phase only on proof from files, commits and refs. It orders the conductor in bounded steps (merge, restart) through `herdr-ws`. It keeps an append-only journal; a restart reconciles open lines and never repeats a merge.

| Unit | File | Job |
|---|---|---|
| Types, phase state | `phase-types.ts`, `phase-state.ts` | phase fields in `lock.json` (`phase`, `phaseStartedAt`, `attempt`, `runs`, optional `mergeHead`) |
| State machine | `advance.ts` | pure `advanceTicket(state, obs, journal) -> Action` |
| Journal | `journal.ts` | `plan`, `settle`, `planIfFree`, `closeOpen`; keys `<KEY>:<phase>:<attempt>:<action>` |
| Input box | `input-box.ts` | `empty / suggestion / typed / unknown` from the pane screen |
| Attention | `attention-write.ts` | `nightwatch-attention/v1` lines |
| Observers | `observe.ts`, `observers-real.ts` | six read-only observers with timeouts; real git, herdr, run store, reviewer data, tracker |
| Reconcile | `reconcile.ts` | step 0 of every tick |
| Act | `act.ts` | one effect per call, plan line before the effect |
| Tick | `tick.ts` | read, observe, reconcile, advance, act |
| Wiring | `scan.ts`, `release.ts`, `index.ts`, `registry.ts` | scan calls the tick when a lock exists; claim and release write journal lines; `autonomous-scan` runs every 5 minutes; new `dg autonomous tick` and `journal` commands |

Rules that hold in the code:
- Pane text is never proof. An observation with `ok: false` never moves a phase and gives one note.
- Ticket text is data: only the validated key and the tracker status string enter the controller.
- Orders are two fixed texts (merge, restart), to the conductor only, one per action, at most one action per ticket per tick, and only when the input box is `empty` or `suggestion`.
- No merge, push, commit, reset or checkout runs from the controller.
- Review rule (Maestro decisions F3, F9, cap): there is no automatic review to building move. Fix waves and parks happen inside the review phase. Review moves to merge-ready when the latest ticket-scope verdict for the current head has no open Critical or Important finding. Round 4 with an open finding gives attention `failed` / `review-rounds-exhausted` and no move.

## Build record

13 tasks, each with a fresh implementer and a role-mode task review by the conductor; a whole-ticket review (Opus) with one fix wave and five scoped re-reviews (r2 to r6). 20 findings in the whole-ticket review chain (F1 to F18, with F9 re-decided by the Maestro). Every Important finding is fixed. F11 is parked. Per-finding record: `findings.md`.

Tests at the end: `pnpm vitest run packages/cli/src/autonomous scripts/nexus-api/src/scheduler` 589 passed (32 files); whole repo 3435 passed (231 files); `pnpm --filter ./packages/cli build` clean; `dg autonomous tick --dry-run` with an empty folder prints `tick: no lock`.

## Mutation checks (by hand, each restored with `git checkout`)

| Mutation | Test that failed |
|---|---|
| (a) drop the rounds cap in `advance.ts` (replaced the plan's attempt-2 check after F9) | `advance.test.ts` "F9: round 4 with open findings is review-rounds-exhausted, no move" |
| (b) journal `plan()` after the effect in `act.ts` | `act.test.ts` "the planned line is on disk before the prompt runs" |
| (c) `order-merge` returns `retryable` instead of `uncertain` in `reconcile.ts` | `reconcile.test.ts` "a merge order git does not show becomes uncertain..." and `tick.test.ts` "killed during a merge > git does not show it: uncertain..." |
| (d) a `merged` or `pushed` event alone moves to `merged` in `advance.ts` | `advance.test.ts` "a merged event without git proof is a disagreement, not a move" |

The first run of (a) used the plan's old attempt-2 check; the F9 change made that check dead, so F14 replaced it and the replacement was run.

## Decisions during the build

- Probe (Task 1): no gate hit. `buildPack` writes `head:` into every `pack.md`; no finished workspace was on disk, so the check is from code and its test. Small plan corrections committed (`herdr-ws agent list` format, `HERDR_WS` env, `ExecOut` with stdout, direct imports instead of `dg` calls).
- Input box: the typed fixture is hand-made (every idle pane was empty or a suggestion). Classifier ties the prompt line to the box rules; only the lowest prompt line counts; unknown waits.
- Reconcile: an `uncertain` key settles only to `succeeded` (proof) or `permanent`; never to `retryable` on its own.
- F9 and the cap: Maestro decisions, written into `design.html` section 5 and `plan.md`.
- F7: `mergeHead` is written when the ticket enters merge-ready, so the git check works after the worktree and branch are gone.

## Follow-ups (not fixed, listed on purpose)

- Task 3: the tracker-failed note in `advanceTicket` still applies to a released ticket (the rule excludes only `merged`). The Reviewer flagged it out of scope; it needs a test when `advanceTicket` is touched again.
- Task 11: `MAIN_CHECKOUT` is duplicated in `observers-real.ts` and `scripts/nexus-api/src/scheduler/registry.ts` and can drift. On a timeout only the direct child gets SIGKILL.
- Task 12: `plan` throws if the journal is unusable at claim time; the `claim-failed` `appendEvent` is not guarded.
- Whole-ticket review: one bad ledger line stops the ticket, because `parseVerdictEntries` throws (the verdict observer then reports `ok: false` and the phase waits with a note).
- Design section 10: the attention cause codes are free strings, not a closed list.
- Test util: `fakes.test-util.ts` and `tracker-clickup` showed existing `tsc` errors in this branch's checks (not from this ticket's new files).
- Unused after F12: the lock field `attempt` stays 1 for the whole ticket (the review rounds come from the review packs). The field and its writer stay for the building phase and older locks.
- F11 (parked): a lost builder run in the review phase is covered by the DGS-583 watchdog (`lost` goes to attention), not by this controller.
- A claim key that is still `uncertain` after the merge (the tracker has left `in progress`) gives `journal-uncertain-claim` every tick until settled. `dg autonomous release --result merged` settles it `permanent` with the note `released` (it runs `closeOpen`). Before the release the conductor can run `dg autonomous journal settle <key> --result permanent`. `runbook-text.md` says so.

## First use (the Maestro's, then Jack's; after the merge and the plugin update)

1. `dg autonomous tick --dry-run` with no lock: prints `no lock`, writes nothing. (`--repo` defaults to the main checkout.)
2. Rehearsal on a throwaway ticket: hand-write a lock with phase `building` in a temp `AUTONOMOUS_DIR` and run `tick --dry-run` at each stage, reading the printed action. No prompt, no write.
3. The Maestro applies `runbook-text.md` to the conductor runbook (`.digismith/sessions/workbox.md` is untracked on purpose).
4. One real Autonomous ticket (a small Sign-off: Auto one) under the DGS-486 first use. Watch `dg autonomous status` and `dg autonomous journal`. Kill and restart the Nexus API once while the phase is merge-ready and check the journal holds one merge order.
5. Registry change: `autonomous-scan` now runs every 5 minutes (288 slots a night); the Nexus scheduler picks it up on its next restart.
