# DGS-583 probe (Task 1, read only)

Written 2026-10-22 02:50 UTC+7 (2026-10-21 19:50 UTC). Plan calls this file `preflight.md`; the brief calls it `probe.md`. This is the one file.

| Item | Answer | Source |
|---|---|---|
| DGS-581 on main, `phase` event | Yes. `PHASES = building, review, merge`, `phase` in `CONDUCTOR_TYPES`, `run/read.ts` has `listRuns`, `showRun`, `tailEvents`; `run/record.ts` has `readRun`; `run/paths.ts` has `depotDir`, `runsDir` | `packages/cli/src/run/events.ts:7-8` |
| DGS-486 on main | Yes. `scan.ts`, `release.ts`, `report.ts`, `index.ts`, `state.ts` (`autonomousDir`, `atomicWrite`, `appendEvent`) | `ls packages/cli/src/autonomous` |
| DGS-582 on main | Yes. Module is `packages/cli/src/autonomous/` (not `nightwatch/`): `journal.ts`, `attention-write.ts`, `phase-state.ts`, `act.ts`, `advance.ts`, `tick.ts` | `git log`, `ls` |
| Journal API | `plan(dir, now, {ticket, phase, attempt, action, detail?}) -> key`, `planIfFree`, `settle`, `readJournal(dir)`, `resultsOf`, `openLines`, `closeOpen`. Key is `ticket:phase:attempt:action`. | `journal.ts` |
| Retry pair (`countRetries`, `planRetry`) | **Absent.** | grep `retry` in `journal.ts` |
| Attention writer | `appendAttention(dir, now, {ticket, run, kind: "unknown"\|"failed", cause})`; open line `{schema, id: "<run>.<kind>.<n>", ts, ticket, run, kind, cause, since}`; `run` is `-` when null; skips when an open item exists for the pair; `n` = earlier opened lines of that pair. No resolved-line writer. | `attention-write.ts` |
| Pane list shape | `{"id":..,"result":{"panes":[{"pane_id":"w2:p1","tab_id":"w2:t1","agent_status":..,...}]}}` via `HERDR_WS=w2 herdr-ws pane list` (read only) | run in this probe |
| `dg` entry used by the registry | `DG = [join(MAIN_CHECKOUT, 'packages','cli','dist','index.js')]`, run with `process.execPath` | `scripts/nexus-api/src/scheduler/registry.ts:7,64` |

## Design gap: the retry has no consumer

Plan Task 5 Step 5 says: if the DGS-582 journal has no pair of functions that count retries and plan a retry, stop and tell the conductor; do not write a second journal.

1. `journal.ts` has no retry count and no retry plan. Only the generic `plan`/`readJournal`.
2. The DGS-582 `Action` type (`phase-types.ts`) is `wait | attention | move | marker | order(merge|restart) | status`. No `retry` action. `act.ts` never reads a planned retry entry. The plan says "the watchdog and `release` only plan, the controller acts". Nothing acts.
3. Also (smaller): `appendAttention` kinds are only `unknown|failed`; the watchdog needs `blocked|stalled|lost|refused` and a resolved line. Notes 1 says extend, do not fork: that is doable inside this ticket.

## Options for the conductor

- A. This ticket adds a thin adapter over `plan()`/`readJournal()` (`retryCount` = count of planned lines with `action: "retry"` for the ticket; `planRetry` = `plan(dir, now, {ticket, phase: "retry", attempt: <n+1>, action: "retry"})`), plus a small controller step in `act.ts`/`advance.ts` that turns an open `retry` entry into the existing `order restart` action. Touches DGS-582 files (merged).
- B. Same adapter, no controller step: the watchdog records the retry plan and the attention item says "retry planned"; the Maestro or a later ticket makes the controller act on it.
- C. Drop the automatic retry from DGS-583 (causes, breaker, attention only); retry goes to a follow-up ticket.

Recommendation: B now (adapter only, item says retry planned, follow-up ticket for the controller step), unless you want A.

Tasks 2 to 4 do not depend on this and can start at once.
