# DGS-598 report: every AI session is a run

Ticket DGS-598. Branch `DGS-598__every-session-a-run`, order oc-01 (Sign-off: Auto).

## What changed
- A session without `DIGISMITH_RUN_ID` is now an automatic run `s-<session_id>`. It is filed under its ticket when the branch names one, else under its project. An explicit `DIGISMITH_RUN_ID` keeps the DGS-581 behaviour.
- `runs/.index/sessions/<sid>` and `runs/.index/pids/<pid>` map a session to its run. A `/clear` in the same claude process continues the run. A resume in a new process refreshes the pid entry.
- `roleOf` in `packages/cli/src/run/role.ts` is the one role rule. Outside herdr: `maestro` when an identity card names the repo folder, else `other`. Inside herdr: a detached labeller reads `herdr-ws agent list` once and sets conductor, reviewer, scout, builder or other. A `claude -p` session (`CLAUDE_CODE_ENTRYPOINT=sdk-cli`) is always `other`, with no labeller. DGS-599 imports `roleOf` from this path.
- The run record gets `source`, `project`, `session_id`, `role_from` and a nullable ticket. `readRun` fills defaults for old records. `dg run start` stores an absolute worktree path.
- `hooks/hooks.json`: the five run-event commands skip a machine without a depot and use the node compile cache in `runs/.index/node-cache`. The plugin version changes at the merge.
- `dg run list` shows runs from the last 7 days by default (`--days N`, `--all`) with the project. Dot folders are skipped.
- The watchdog watches only builder, reviewer and scout runs. Open items of other runs close with "role not watched".
- nightwatch views, the Nexus API (`GET /api/v1/nightwatch/runs?project=P`) and Oculus show the project, the source and a null ticket, and filter runs by project. Three visual baselines changed for the new Project select. The phone runs baseline was refreshed again after the rebase onto main's DGS-600 top bar.

## Tests
- At the last code commit, after the rebase onto main `e4519f9`: root `pnpm test` has 268 files and 4151 tests, all passed. `pnpm --filter @digismith/cli build` (tsc) is clean.
- `nexus-web` unit tests: 312 passed, and 1 timeout failed in `grid.test.ts` (CalendarGrid) under load. That file passes alone (11/11), and the branch does not touch it. `pnpm visual` after the rebase: 176 passed, 148 skipped (after one baseline refresh).
- Clean web gate before the rebase (18:28-19:19 UTC+7, load 9-16): a11y 397 passed, e2e 58 passed. `nuxt typecheck` shows 8 errors, all in `nexus-api/src/scheduler/{clock,guard,runlog}.ts` from main (DGS-456). This branch does not change those files.
- Load flakes seen and passed alone: `scheduler/runner.test.ts` and `test-install.test.ts`. The branch does not touch them.
- Hook timing: by default the test only prints the numbers. `NIGHTWATCH_TIMING=assert`, run alone, fails above 40 ms over a bare node start. Alone at load 11 the overhead was 20 ms (SessionStart) and 37 ms (PostToolUse). At load 13-16 it was 31-64 ms. The machine was never idle during this build.

## Review
Nine tasks, each reviewed. Every task had Minor findings only, except Task 5 (one Important finding: the timing assertion). Tasks 1, 3 and 5 had a scoped r2; Tasks 2, 4, 6, 7 and 8 closed their fixes without one, by the conductor's word. Task 8 F1 was rejected with a reason. Task 9 F1 was parked. Whole-branch review round 1: with fixes (F1 and F2 Important, F3-F5 Minor). F1-F4 were fixed and F5 was parked. Round 2: clean. See `findings.md`. The SHAs in the per-task rows are from before the rebase.

## Follow-ups
- Take the Oculus Project choices from an unfiltered source, so the list does not shrink to the chosen project (Task 9 F1 and whole-branch F5).
- Run the hook timing test with `NIGHTWATCH_TIMING=assert` on an idle machine, and confirm the overhead is 40 ms or less.
- A watched run with a null ticket prints "null" in its watchdog line (Task 7 note).
- Reviewer recommendation: store the entrypoint (or a headless flag) in the run record, so Oculus can hide or group `claude -p` runs.
- Reviewer recommendation: `views.ts` `loadAll` reads each run's events twice. This existed before this ticket; the 7-day window keeps the cost bounded.

## After the merge
The conductor runs the plugin update in the worker panes. The Desktop Maestro needs a restart to load the new `hooks/hooks.json`.
