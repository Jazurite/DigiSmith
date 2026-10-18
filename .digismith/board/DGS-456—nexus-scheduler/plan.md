# DGS-456 plan: the scheduler engine inside the Nexus API

Design: `design.md` (same folder), rev 3 (Jack's four changes of 2026-10-18; rebased on main). This plan lists the build tasks (test first) and **Jack's step list**.
Rules kept: pnpm only, TDD, Vitest from the repo root, no `sudo`, no `launchctl`, no new LaunchAgent, no Caddy or Tailscale Serve change, no restart of the running API (4300), no real job, no real ClickUp write, nothing sent to a conductor in any test or script of the build. `v1` is a placeholder (DGS-452). No AI attribution; commit by named paths.

## Files
```
scripts/nexus-api/src/scheduler/
  types.ts        RunRecord, JobInfo, JobsResponse, RunsResponse, RunNowRequest/Response, JobsError (the front-end copy)
  registry.ts     JobDef, defaults (order 100, notify 'failures', manualOutsideWindow 'allowed', catchUp 'run-once-in-window'), the JOBS list (selftest only)
  clock.ts        UTC+7 helpers: nights, slots (midnight window, everyMinutes), currentSlot(now, job), inWindow, nextRunAt; now() injectable
  runlog.ts       monthly runs-YYYY-MM.jsonl append and read (newest first, limit), state.json (atomic write)
  runner.ts       runs one job as a child process (execFile, fixed argv), timeout, SIGTERM then SIGKILL, output tail
  notify.ts       Notifier list; clickup notifier (dg clickup add-comment DGS-436), per-job-per-hour dedupe
  engine.ts       tick (30 s), due slots, missed-run rule, serial queue, overlap, run now, start/stop (clean-stop mark, interrupted)
  guard.ts        token file (mode 600, created on first start, never logged), constant-time compare, POST checks
  routes.ts       Hono sub-app: GET /jobs, GET /jobs/<name>/runs, POST /jobs/<name>/run
scripts/nexus-api/src/app.ts             mounts the jobs routes through AppDeps.jobs (existing routes and tests unchanged)
scripts/nexus-api/src/server.ts          starts the engine, passes it to the app, SIGTERM handler
scripts/nexus-api/install.sh             copies src/scheduler/*.ts too (no tests); creates $DEPOT/nexus/scheduler/ (no token written by install)
scripts/nexus-api/src/scheduler/*.test.ts
```
Depot after `install.sh`: `~/.digismith-depot/nexus-api/src/scheduler/`. At run time the API creates `~/.digismith-depot/nexus/scheduler/` (`runs-YYYY-MM.jsonl`, `state.json`, `token` mode 600). `NEXUS_STATE_DIR` overrides that folder (tests).

## Tasks (all test first)

### Task 1: Types and registry

(`types.test.ts`, `registry.test.ts`): job names are url-safe and unique; defaults applied (order 100, notify `failures`, manualOutsideWindow `allowed`, catchUp `run-once-in-window`, timeout 10 min, cap 2 h); every command path is absolute; `schedule` is validated at load (`HH:MM`, end equal to start refused, `everyMinutes` 5 to 720 whole, end before start allowed); `selftest` is the only registered job, has no schedule slot and prints one line; no other file spells a version literal (reuses `version.ts`).

### Task 2: Clock

(`clock.test.ts`): fake `now`; slot at `00:10` UTC+7 is `17:10Z` the day before; window `[00:10, 05:00)` bounds (inclusive start, exclusive end); next run after the window is tomorrow's slot; a window crossing midnight (`23:00` to `06:00`): 23:30 and 02:00 are inside, 06:00 and 12:00 are not; the 01:00 slot belongs to the night that started the day before; repeating slots (every 60 min from 23:00 gives 23:00 to 05:00, the last start before 06:00; every 90 min gives 23:00, 00:30, 02:00, 03:30, 05:00); no `everyMinutes` gives one slot; the current slot and `nextRunAt` across midnight and across a month change; fixed +7 offset across a UTC month change.

### Task 3: Run log and state

(`runlog.test.ts`): one line per run, valid JSON, monthly file by UTC+7 month; month change opens a new file, the old one is untouched; read newest first with limit and across two files; `state.json` written by temp file and rename (a partial file never read); `cleanStop` false at start, true on stop; a corrupt `state.json` starts as "unclean" and never throws.

### Task 4: Runner

(`runner.test.ts`): ok (exit 0), failed (exit 1, `detail` is the output tail, capped 2000 characters), timeout (a child that sleeps is killed, SIGTERM then SIGKILL after 10 s), a command that does not exist gives `failed` not a throw; `execFile` only, no shell (an argument with `;` is one argument).

### Task 5: Engine

(`engine.test.ts`; fake clock, fake runner): due slot runs once; not before the slot, not after the window; a midnight-window job runs at 23:00 and 01:00 (repeating, one run per slot, each slot key once); missed slot inside the window runs once as `catch-up`; after 3 hours of downtime in a repeating window exactly one catch-up run and the older slots logged `skipped` (reason `missed`), never a burst; missed slot after the window is logged `skipped` (reason `missed`) and nothing runs; a slot reached while the job still runs is `skipped` (reason `busy`); `catchUp: 'skip'` never catches up; no second run for one slot after restart (`lastSlot` and the log); overlap: same job refused (`already_running`), two jobs due together run one after the other in `order`; run now ignores the window, but `manualOutsideWindow: 'refused'` outside the window is refused; `interrupted` is logged at start for an `inFlight` run, and at stop for a running child; the runner throwing never stops the tick.

### Task 6: Notify

(`notify.test.ts`; fake `dg` script that records its argv): `failed`, `timeout`, `interrupted` and an unclean start each send one comment on DGS-436 with job, status, time UTC+7 and the first 300 characters of `detail`; `ok` sends one only with `notify: 'always'`; at most one comment per job per hour (the second failure inside the hour is not sent, one after the hour is); the comment call times out at 30 s; a failing `dg` is logged only and the run line stays `failed`/`ok`; fixed argv, nothing from a request.

### Task 7: Guard

(`guard.test.ts`): the token file is created on first start with mode 600, reused on the next start, never written to the log or to any response (a test greps the captured log and bodies for it); POST without `Content-Type: application/json` gives `400`; wrong or missing `X-Nexus-Token` gives `403`; `confirm` not equal to the job name gives `400`; a cross-site form POST (form content type, no token) is refused; all four checks pass gives `202`; GET needs none of them.

### Task 8: Add the jobs routes and start the engine

(`routes.test.ts`, existing `server.test.ts` kept unchanged and green): the JSON shapes of `/jobs`, `/jobs/<name>/runs?limit=`, `/jobs/<name>/run`; 404 for an unknown job and every other path (unversioned, other version, extra segment); 405 with `Allow` (GET for the list and runs, POST for run); 409 while running; `/power-metrics` answers exactly as before; the runner throwing and the notifier failing leave `GET /jobs` and `GET /power-metrics` answering; `app.test.ts`, `life-calendar-route.test.ts` and `server.test.ts` stay unchanged and green; one test starts a **throwaway server on a high port** with a temp `NEXUS_STATE_DIR`, the `selftest` job and a fake `dg`, and drives it with `fetch`. **Run now from the Workbox (change 3):** in the same test a separate Node process (`execFile`, no shared memory) reads only the token file from the temp state dir and calls `POST /jobs/selftest/run` with `fetch` (JSON, `X-Nexus-Token`, `confirm`): `202`, then the run appears in `/runs`; without the token `403`. No Lights-Out job is registered.

### Task 9: install.sh

(`test-install.test.ts` extended): `src/scheduler/*.ts` copied, no tests or fixtures; the depot copy starts on a high port and serves `/api/v1/jobs`; still no `sudo`, `launchctl` or `/etc/` in the script; the plist is unchanged.

### Task 10: Mutation checks

(done by hand once, noted in report.md): window end bound, overlap check, token compare, comment dedupe, clean-stop mark: each mutation makes a named test fail.

## Proof summary
Everything in tasks 1 to 10 runs on this Mac with no root, no network and no ClickUp (the `dg` in tests is a recording script). It never touches the running API on 4300, Caddy, the real depot's run log or token, or any conductor.

## Jack's step list (every step is Jack's; an agent never runs them)
After the build is merged and `install.sh` has copied the code into the depot (an agent runs `install.sh`: it writes only inside the depot):

**J1. Restart the running API once** so it loads the new code (the plist does not change; no new LaunchAgent, no sudo):
```
launchctl kickstart -k gui/$(id -u)/com.jazurite.digismith.nexus-api
```
The API creates `~/.digismith-depot/nexus/scheduler/token` (mode 600) on this start.

**J2. First use (laptop, Tailscale on):**
```
curl https://pazurite.com/api/v1/jobs
curl https://pazurite.com/api/v1/power-metrics | head -c 300
```
Expected: `selftest` listed with `nextRunAt: null` and `lastRun: null`; power-metrics still answers `source.status: "ok"`.

**J3. Run the self-test job once (on the Workbox, the token stays on the Workbox):**
```
T=$(cat ~/.digismith-depot/nexus/scheduler/token)
curl -s -X POST https://pazurite.com/api/v1/jobs/selftest/run -H 'Content-Type: application/json' -H "X-Nexus-Token: $T" -d '{"confirm":"selftest"}'
curl -s https://pazurite.com/api/v1/jobs/selftest/runs
tail -n 1 ~/.digismith-depot/nexus/scheduler/runs-*.jsonl
```
Expected: `202 accepted`, one `ok` run in `/runs`, the same line in the run log. Without the token header the same `POST` gives `403`; a second `POST` while the first runs gives `409`.

**J4. (optional, only if Jack agrees) The failure comment:** one run of a deliberately failing `selftest` variant (the build adds an environment switch `SELFTEST_FAIL=1` read only by the selftest command; Jack sets it in a throwaway Node start on a high port, not the live API) posts one test comment on DGS-436 through `dg`. This checks that `dg clickup add-comment` finds its credentials without Jack's shell environment, the one risk the design names.

**Risks to watch (not steps):** a LaunchAgent starts with a short `PATH` (the registry uses absolute paths); a restart of the API while a job runs logs it `interrupted` (expected); the first real jobs (flux, cleanup) are added by their own tickets with their own first use.

## Not in this ticket
The Lights-Out scan job (DGS-486, one registry entry), real jobs (DGS-435 flux, DGS-439 cleanup), push and email (DGS-448), the login (DGS-458), `dg schedule` (DGS-457), the version scheme (DGS-452).
