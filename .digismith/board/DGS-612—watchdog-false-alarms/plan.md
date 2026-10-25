# DGS-612 spec and plan: watchdog false alarms

Goal: an attention item means a live problem. All code is CLI only (`packages/cli/src`), no web file, no hook change.

## Spec

Rules in `classify` (`watchdog.ts`). Order matters, first match wins. `status` is the herdr agent_status of the pane (DGS-589).

| # | Rule | Verdict | Test |
|---|------|---------|------|
| R1 | pane gone | lost `pane-gone` (kept) | existing + keep |
| R2 | permission prompt unanswered (60 s grace, status rule) | blocked (kept) | existing, unchanged |
| R3 | pane present, status `idle`/`done`/other non-working | healthy `waiting`. No silence alarm, no phase budget. A Builder at a planned STOP is not a problem. | silent 5 h + idle = healthy |
| R4 | pane present, status `working`, no event for 3 h | stalled `silent-working-180-min` | silent 3 h + working = stalled; 2 h = healthy |
| R5 | pane present, status `working`, silent under 3 h | no silence alarm. This covers a long background subagent: its tool calls are not in the run, but herdr shows `working`. | silent 100 min + working = healthy |
| R6 | pane unknown (no herdr data), 30 min silent | lost `silent-30-min` (kept: a live run with no pane data still alarms) | existing, kept |
| R7 | phase budget (R5 and R6 cases only; R3 skips it) | building 45 -> 180 min, review 60, merge 20 | building 100 min working = healthy; 190 = stalled |

Subagent activity: no `SubagentStop` hook. `hooks/` is a protected path and a hook needs a plugin reload. R4 and R5 use herdr `working` instead, which also covers a subagent that writes no event.

Retry (`watch.ts`, `advance.ts`):
- A lost item is `retryEligible` only with cause `pane-gone`. Silent-unknown lost alarms but is never retried. A retry cannot restart a run whose pane is alive.
- `retryStep` takes only items of the ticket's newest builder run (latest `createdAt`). Items of older runs are never retried.

Closing stale items, in the watch pass (never by hand, never by editing attention.jsonl):
- C1 Superseded: a watched run with a newer run of the same ticket and role has its open blocked/stalled/lost items closed (`superseded by <run>`), and the pass opens nothing for it.
- C2 Finished: a run with a `merged` event, or whose `worktree` is set but the folder no longer exists, is finished. Same close, same no-open (`ticket done`).
- C3 A blocked/stalled/lost item whose run record is gone closes (`run record gone`).
- The 12 items open today (builders of DGS-598, 599, 590, 606, 613: worktrees removed, C2; DGS-589 refinement: superseded, C1; DGS-600: C2 or C3) close on the first watch pass after the plugin and CLI update. The conductor runs `dg autonomous watch --dry-run` first and checks the "would resolve" count, then a real pass.

Release commit: the merge order text (`ORDER_TEXTS.merge`, `order.ts` usage line) tells the conductor to run `dg autonomous release --ticket T --result merged --commit <main HEAD sha>`. The report already prints `commit`; the gap was the order text.

## Plan

### Task 1: classify rules R3 to R7
Test first in `watchdog.test.ts` (rows above, plus: gone pane still lost, answered/unanswered prompt unchanged, unknown pane silent 30 min lost). Then edit `classify` and `DEFAULT_BUDGETS.building = 180`. Check `budgets.test.ts` and `WATCHDOG.md` for the old 45 and update them.

### Task 2: watch.ts retry flag and closing C1 to C3
Test first in `watch.test.ts`: lost silent-unknown has `retryEligible` false, pane-gone true; older run's items closed when a newer run exists and nothing opened for it; merged-event run and removed-worktree run closed; item with missing run record closed; live run's item stays. Then implement.

### Task 3: retry targets the newest run
Test first in `advance.test.ts`: two builder runs of one ticket, lost item on the older one, no retry action; lost pane-gone item on the newer run, retry action naming it. Edit `eligible`/`retryStep`.

### Task 4: Oculus uses the live pane
Test first in `oculus/derive.test.ts` and the views test: `runRowOf` takes pane and status; present pane + working + silent 40 min reads healthy, gone pane reads lost. `views.ts` gets a `panes` dep (default `herdrPaneLookup`, one lookup per workspace per build); herdr down gives "unknown".

### Task 5: release commit in the merge order
Test first in `act.test.ts`: `orderText("merge", T)` contains `--result merged --commit`. Edit `ORDER_TEXTS.merge` and the usage line in `order.ts` (update `order.test.ts`).

Final gate: `pnpm --filter @digismith/clickup-client build` then the CLI test suite and typecheck.
