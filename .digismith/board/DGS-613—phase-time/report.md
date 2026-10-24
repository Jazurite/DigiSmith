# DGS-613 report: Oculus, the phase and the time in the phase

Ticket DGS-613 (J.5 Oculus). Branch `DGS-613__phase-time`, order oc-04 (Sign-off: Auto). Forecasts are not in scope (DGS-614).

## What changed
- Runs table: the Duration cell of a running run shows the phase and its time, for example `0:31:07 · building 0:14`. There is no Phase column. The screen-reader text says the times in words.
- Run page: the phase strip shows the duration of each step (h:mm). The current step shows a live counter in the info colour, with no "now" word. Its screen-reader text is "current, 14 min so far". A step that the run did not reach shows "-".
- CLI view (`dg oculus view`): two new fields come from the events that exist today. There is no new event type.
  - `RunRow.phaseSince` comes from the watchdog's `phaseOf().since`. The budget bar uses the same value, so the bar and the row show the same number.
  - `PipelineStep.durationSec` is the gap to the next step that has a time. The last step of an ended run lasts until the run ended. Pushed has no duration. A negative gap gives null, never a false number.
- Shared schema `scripts/nexus-shared/oculus.ts`: `phaseSince: iso.nullable()` and `durationSec: count.nullable()`. The Nexus API passes both through with no code change.
- Web: the helpers `phaseTime`, `stepTime`, `spokenSeconds` and `spokenMinutes` in `oc-format.ts` hold every "-" rule. `oc/RunsTable.vue` and `oc/PipelineBar.vue` use them, and `pages/oculus/run.vue` passes the page clock (`useNow`, 30 s).

## Tests
- Full web gate, once, on `01d86bdc`: e2e 82 passed and 6 skipped; a11y 515 passed and 1 skipped; visual 238 passed and 210 skipped; web Vitest 372 of 372 (35 files). Nothing failed.
- Visual baselines: 14 changed and 4 new (the PipelineBar Manual pair and the RunsTable PhaseEdges pair). The mobile Run page and the RunsTable tokens-states baselines changed because the new strip and Duration content shows in them. The mobile run image shows durations under each time, the live blue 0:50 on the current step (no "now"), dashes for steps not reached, and the DGS-590 tokens card below.
- A plain `visual:update` did not rewrite four baselines, because the 0.001 pixel tolerance hides a text change that small. The implementer forced them with a temporary config at tolerance 0 and then removed it.
- Before the merge, 2026-10-25 03:49 UTC+7 (20:49 UTC, 24 Oct): CLI Vitest 2309 of 2309 (158 files); strip-types smoke 8 of 8. The worktree had no `@digismith/clickup-client` dist; I built it, as in Task 1.
- `nuxt typecheck` shows 8 old errors in `nexus-api/src/scheduler`. This branch does not change those files.
- All tests use fakes: the stub server, and a fake depot in a temp `DIGISMITH_DEPOT_DIR`. No real ClickUp, herdr, live API or real depot.

## Review
Five tasks, each reviewed:
- Tasks 1, 2 and 5: approved, no findings.
- Task 3: 2 Minor. F1 was fixed (`a99cbb4e`). F2 is parked by the conductor's ruling: the new Duration test pins the full cell text.
- Task 4: 1 Minor, F1, fixed (`71cde7b8`).
- The whole-branch review was ready to merge with 1 Minor finding (the one-item `v-for` in `RunsTable.vue`). It is fixed with a one-line comment in the merge-prep commit, with no re-review, by the conductor's order.
- See `findings.md`.

## Follow-ups
- Task 3 F2: the running-row test in `runs.test.ts` uses a prefix match.

## After the merge (the conductor)
The publish and the first use belong to the conductor. The Builder did not rebuild the CLI dist, restart the Nexus API (port 4300) or run `build-www.sh`.
