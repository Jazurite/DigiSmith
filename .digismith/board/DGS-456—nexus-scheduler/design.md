# DGS-456 design: the scheduler engine inside the Nexus server

Date: 2026-10-13, rev 3 on 2026-10-18 (checkpoint 1 answered by the Nexus Maestro: per-job fields, guard approved; Jack's four changes: midnight windows, repeating slots, no Lights-Out job here, run-now from the Workbox; rebased on main). Design only; nothing installed. `v1` is the placeholder version (DGS-452), always read from `src/version.ts`.

## Summary
The scheduler is a module of the existing Nexus API process (`scripts/nexus-api/`). The existing KeepAlive LaunchAgent stays the one keep-alive. A job is a registry entry: a name, a clock rule and one fixed command (`execFile`, no shell, no model tokens). The engine runs each job as a **child process** with a timeout, so a crashing or hanging job cannot take the API down. Every run adds one JSON line to a run log in the depot. A failed run, or a start after an unclean stop, adds a ClickUp comment on DGS-436 through `dg`. `GET` shows jobs and runs. `POST .../run` is guarded by three checks (see 4).

## 1. Where the engine lives: inside the Nexus API process (recommended)
- **Why:** Jack's decision (scheduler inside Nexus), one LaunchAgent already installed with `KeepAlive`, no new plist, nothing for Jack to install. A second process would need a second LaunchAgent (Jack's step, one more thing to keep alive) and a way to talk to the API.
- **The cost, and how it is contained:**
  - The engine runs in the same Node process as the HTTP server. Rules: no job code runs in-process, only `child_process.execFile`; every tick, run and notify call is inside `try/catch`; the HTTP handlers never `await` the engine (they read an in-memory snapshot and the log).
  - A crash of the whole process is the worst case. `KeepAlive` restarts it (launchd throttles to one start per 10 s). The restart is visible: on start the engine sees that the last stop was not clean (state file, section 5) and comments on DGS-436.
  - A Nexus restart for a new API version while a job runs: on `SIGTERM` the engine stops the child (SIGTERM, then SIGKILL after 10 s), logs the run as `interrupted`, and writes the clean-stop mark. At the next start the missed-run rule decides whether to run it again (section 3).
- **Routes (rev 3):** main now has `app.ts`, a Hono app with the power-metrics and life-calendar routes (DGS-481). The jobs routes are added to that app (`routes.ts` exports one Hono sub-app, mounted through `AppDeps.jobs`); `server.ts` starts the engine and the SIGTERM handler. Existing routes and their tests stay unchanged and green.

## 2. Jobs
```ts
// scripts/nexus-api/src/scheduler/registry.ts : plain data, in the repo, reviewed like code
export interface JobDef {
  name: string                    // 'night-flux', 'cleanup'; url-safe, unique
  description: string
  schedule: { atUtc7: string; windowEndUtc7: string; everyMinutes?: number }  // '23:00' to '06:00': scheduled runs start only inside this window; the window may cross midnight; everyMinutes repeats the slot inside it
  command: { file: string; args: string[] }             // absolute paths, fixed, nothing from a request
  timeoutMs: number
  catchUp: 'run-once-in-window' | 'skip'               // missed-run rule, default 'run-once-in-window'
  order: number                                         // queue order when two slots are due together, default 100 (lower first)
  notify: 'failures' | 'always'                         // ClickUp comment on DGS-436, default 'failures'
  manualOutsideWindow: 'allowed' | 'refused'            // run now outside the window, default 'allowed'; flux sets 'refused'
}
```
- **A job is a `dg` command** (DGS-434: "a job is a plain dg command"): `node --experimental-strip-types <depot repo>/.../dg ... `. **The job's own rules live in that command, not in the scheduler**: flux checks "all tickets done" (DGS-435), cleanup applies `CLEANUP_DAYS = 3` and deletes only under its own written rule (DGS-439). The scheduler never deletes anything.
- **Per-job fields, not hard-coded (Nexus Maestro, checkpoint 1):** time, window, order, `notify` and `manualOutsideWindow` belong to DGS-434 (Scheduling Maestro). The engine only has safe defaults (above); the flux and cleanup tickets set their own values. Known rule (Jack): flux runs only at night UTC+7, around midnight, after all its tickets are done, never in daytime, so its entry sets `manualOutsideWindow: 'refused'`. The example entries (flux `00:10`, cleanup after it, window to `05:00`; a night scan `23:00` to `06:00` every 60 min) are examples in tests, not registered jobs. **No Lights-Out job is registered in this ticket**: DGS-486 adds it later as one registry entry, no engine change.
- **Repeating (rev 3):** `everyMinutes` (whole minutes, 5 to 720) repeats the start inside the window: `atUtc7: '23:00', windowEndUtc7: '06:00', everyMinutes: 60` gives starts at 23:00, 00:00 ... 05:00. The last start is before the window end. Without `everyMinutes` the job has one slot at `atUtc7`. A window whose end equals its start is refused at load; end before start crosses midnight.
- **What the scheduler owns** is only the clock rule: night-only UTC+7, the time, the window, the timeout. Those come from the DGS-434 concept; until the Scheduling Maestro gives the job list, the registry ships with **one harmless job `selftest`** (a command that prints one line; never in the nightly window; run-now only) so the engine can be proved end to end. `night-flux` and `cleanup` are added by their own tickets when their `dg` commands exist: one registry entry each, no engine change.
- **The registry is code in the repo**, copied to the depot by `install.sh` (DGS-265), like the rest of the API. There is no job list file in the depot to edit by hand, no way to add a job over HTTP.

## 3. Timing
- **Clock:** UTC+7 has no daylight saving; the engine computes with a fixed offset of 7 hours on UTC milliseconds (no timezone database, no `TZ` variable). One `now()` function, replaceable in tests.
- **Night and slots (rev 3):** a night is named by the UTC+7 day on which its window starts. Its window is `[D at atUtc7, E at windowEndUtc7)` where `E` is `D`, or `D+1` when the end is before the start (crosses midnight). Its slots are `D at atUtc7 + k * everyMinutes` while before the window end (one slot when no `everyMinutes`). A slot belongs to the night that starts on the window's start day: the 01:00 slot of the 23:00 to 06:00 window belongs to the night of the day before. A slot's key is `<D>@<HH:MM>`; the key is in the run record.
- **Tick:** every 30 s the engine looks at the nights that started today and yesterday. The **current slot** is the latest slot of those nights that has passed while `now` is inside that night's window. The current slot is due when no run or skip for it is in the log. The window is what makes a job night-only. A slot that is not the current slot and has no log line is a missed slot (below).
- **Missed runs (Nexus down at the slot time), per slot:** recommended `run-once-in-window`. A due slot with no line in the log runs **once** (trigger `schedule` when it is within one tick of the slot, else `catch-up`). Older slots of the same night with no line are logged `skipped` (reason `missed`): at most one catch-up run per job per tick, never a burst after downtime, however many slots passed. If the window is over, the missed slots are logged `skipped` (reason `missed`) and nothing runs in daytime. A job that must never catch up sets `catchUp: 'skip'` (then every missed slot is `skipped`). A slot reached while the job still runs is logged `skipped` (reason `busy`), not queued twice.
- **Overlap:** one run per job at a time; a second request for a running job is refused (HTTP 409, `already_running`). **Across jobs also one at a time** (a serial queue): flux and cleanup must not overlap, and a night-time queue costs nothing. Queued jobs keep their slot; the queue is in memory.
- **Timeout:** per job, `timeoutMs`; on timeout the child gets SIGTERM, then SIGKILL after 10 s; the run is `timeout`. Default 10 min, cap 2 h.
- **Run now** (`POST`) does not use a slot and ignores the window unless the job has `manualOutsideWindow: 'refused'` (then outside the window: `403`, `forbidden`, message names the window). It still respects overlap and the job's own rules inside its command.

## 4. Jobs API (the TypeScript text is `scripts/nexus-api/src/scheduler/types.ts`, copyable)
```ts
export type RunStatus = 'ok' | 'failed' | 'timeout' | 'interrupted' | 'skipped'
export type RunTrigger = 'schedule' | 'catch-up' | 'manual'

export interface RunRecord {              // one JSON line of the run log, and one item of /runs
  id: string                              // '2026-10-14T00:10:03Z-night-flux'
  job: string
  trigger: RunTrigger
  slot: string | null                     // '2026-10-18@23:00' for schedule, catch-up and slot skips; null for manual
  status: RunStatus
  startedAt: string; startedAtUtc7: string        // ISO UTC; "2026-10-14 07:10:03"
  endedAt: string | null; durationMs: number | null
  exitCode: number | null
  detail: string                          // last 2000 characters of stdout+stderr, or the skip reason
}
export interface JobInfo {
  name: string; description: string
  schedule: { atUtc7: string; windowEndUtc7: string; everyMinutes: number | null }
  nextRunAt: string | null; nextRunAtUtc7: string | null    // null when the job has no slot (run-now only)
  running: { startedAt: string; trigger: RunTrigger } | null
  lastRun: RunRecord | null
}
export interface JobsResponse { generatedAt: string; jobs: JobInfo[] }                // GET /api/v1/jobs
export interface RunsResponse { job: string; runs: RunRecord[] }                       // GET /api/v1/jobs/<name>/runs?limit=50 (newest first, max 200)
export interface RunNowRequest { confirm: string }                                      // POST /api/v1/jobs/<name>/run, confirm = the job name
export interface RunNowResponse { accepted: true; run: { id: string; startedAt: string } }   // 202; the run goes on in the background
export interface JobsError { error: 'not_found' | 'already_running' | 'bad_request' | 'forbidden' | 'method_not_allowed'; message: string }
```
Status codes: 200, 202 (run accepted), 400, 403, 404, 405 (with `Allow`), 409. The run's result is read afterwards through `/runs` (the `POST` does not wait, so a long job never holds an HTTP request).

**The guard for `POST` (no login on `/api/*`, DGS-458 later).** Without a guard, any process of the `workbox` user and any tailnet device can start a job, and a web page open in Jack's browser could fire a cross-origin `POST` (a "simple" request needs no preflight). Options:
| Option | Stops | Does not stop | Cost |
|---|---|---|---|
| A. Loopback only: refuse when `X-Forwarded-For` is present (Caddy adds it) | every tailnet device, a browser page | any local process, agents included | `dg` can run jobs only on the Workbox, not from a laptop; a Caddy change would be needed to lose the header by accident (a test pins it) |
| B. Token in the depot (`X-Nexus-Token`; the API creates a mode 600 file on first start, never logs or returns it, and compares it in constant time; Caddy's `header_up -Authorization` does not touch it) | tailnet devices without the file, a browser page | an agent that can read the file (same user) | `dg` and Jack need the file or its value; a remote `dg` needs the value copied once |
| C. Wait for DGS-458 (POST disabled, `403`, until a login exists) | everything | nothing runs on demand | `dg schedule run` (DGS-457) and Jack's first-use test cannot work until DGS-458 |
| D. Confirm field only | a mistaken click or a prefetch | anything deliberate | none |

**Run now from a process on the Workbox (rev 3).** The end of each Lights-Out build (DGS-486) calls `POST /api/v1/jobs/<name>/run` from a process on the Workbox that reads the token file (`~/.digismith-depot/nexus/scheduler/token`, or `$NEXUS_STATE_DIR/token`) and sends it as `X-Nexus-Token`. This works with the guard below as it is: the token file is the credential, the call goes to `http://127.0.0.1:4300` (no Caddy, so no forwarded-for), content type JSON, `confirm` = the job name. A test starts a throwaway server on a high port with a temp state dir and calls run-now from a **separate Node process** that only reads the token file and uses `fetch`.

**Approved (Nexus Maestro): B + D + a content-type rule.** `POST` needs `Content-Type: application/json` (a cross-origin page cannot send it without a preflight, and the API sends no CORS headers, so the browser blocks it; this also stops a **cross-site form POST from any web page Jack has open**, because an HTML form can only send form encodings or `text/plain`), a body `{"confirm":"<job name>"}`, and the token header; any of them missing gives `403`/`400`. No agent is stopped by a token it can read, and no design can stop one without root or a second user; what limits an agent is that **run now can only start a job already in the registry, with its fixed command and no argument**, so the worst case is a registered job starting early (its own rules still apply). When DGS-458 lands, its login replaces the token with no engine change. If Jack prefers A (the Workbox only), the check is one line and the token drops out.

## 5. Run log and state (depot: `~/.digismith-depot/nexus/scheduler/`)
- `runs-YYYY-MM.jsonl` (month in UTC+7): **one JSON line per finished run** (`RunRecord`), appended with one `appendFile` of one line (the engine is the only writer). The morning catch-up reads the newest file(s) and the lines since the previous night; **rotation = a new file each month**, old files stay (the scheduler never deletes; a year is under a few hundred KB).
- `state.json`: `{ cleanStop: boolean, inFlight: {job, startedAt, pid} | null, lastSlot: { <job>: '2026-10-18@23:00' } }` (the newest slot key handled, run or skipped; the log is the check for older slots), rewritten atomically (temp file, rename). `cleanStop: false` is set at start and `true` on a clean `SIGTERM`; a start that finds `false` reports an unclean stop and logs the `inFlight` run as `interrupted`.
- The directory comes from one environment variable (`NEXUS_STATE_DIR`, default the depot path) so tests use a temp directory.
- `detail` is capped (2000 characters); job output is operator text, not a place for secrets, and the engine does not read any `.env`.

## 6. Failure
- A run that ends `failed`, `timeout` or `interrupted`, and a start after an unclean stop: **one ClickUp comment on DGS-436** through `execFile` of `dg clickup add-comment --task DGS-436 --text "<text>" --yes` (DGS-442; fixed argv, the text built from job name, status, time UTC+7 and the first 300 characters of `detail`). The comment call has its own 30 s timeout, runs after the log line is written, and **its failure is only logged** (the run is already in the log). Dedupe: at most one comment per job per hour. (Fix 2026-10-19, ticket review r1 F1: the first form here was positional; the real command needs `--task`, `--text` and `--yes`.)
- Per-job `notify: 'always'` also comments on success (DGS-434 decides per job; default `failures`).
- Push or email (DGS-448, not built): the notifier is a list of functions with one shape (`(event) => Promise<void>`); DGS-448 adds one entry.
- **The engine never takes the API down:** child processes for jobs and for `dg`, `try/catch` around every tick and notify, an `unhandledRejection` handler that logs, and a test where the job runner throws and `GET /jobs` still answers.
- **Risk to prove at first use:** a LaunchAgent starts with a short `PATH` and no shell profile. The registry uses absolute paths (`node`, the depot's `dg`), and `dg clickup add-comment` must find its credentials in the depot without environment variables from Jack's shell. The first-use test sends one real test comment on DGS-436 (Jack agrees to the text first).

## 7. Jack's steps and the proof
- **Jack's steps (after the build is approved):** J1 run `install.sh` output check is an agent task, so none; **J1: one restart of the running API** (`launchctl kickstart -k gui/$(id -u)/com.jazurite.digismith.nexus-api`), because the process must load the new code (the plist does not change). J2 first use (below). No sudo, no new LaunchAgent, no Caddy change (`/api/*` already forwards every path).
- **Proof without Jack:** a fake clock (`now()` injected) and a fake runner (a function returning ok/fail/hang): the slot due, outside the window, missed run inside and outside the window (run once / skipped), no second run for one slot, overlap refused (API 409 and a queue across jobs), timeout kills the child, `interrupted` after a restart with `inFlight`, clean-stop mark, run log lines and monthly file, rotation across a month change, comment on failure (a fake `dg` script that records its argv; failure of the comment does not fail the run), the runner throwing leaves `GET /jobs` answering, the POST guard cases (no token, wrong token, wrong content type, wrong confirm, forwarded-for), route table (power-metrics unchanged). One test starts a **throwaway server on a high port** with a temp `NEXUS_STATE_DIR` and the `selftest` job, and drives it with `fetch`. Mutation checks: window bound, overlap, token check, comment dedupe. No test touches the running API (4300), Caddy, the real depot, ClickUp or a conductor.
- **First use for Jack (rev 3: J1 restart, J2 `GET`, J3 run `selftest` once with the token file):** `curl https://pazurite.com/api/v1/jobs` shows `selftest` with no `nextRunAt` and `lastRun: null`; run it once (command given in the plan, uses the token file); `/runs` shows one `ok` line and the file `runs-2026-10.jsonl` has the same line; a second run during the first gets `409`; then one test comment on DGS-436 (a deliberately failing `selftest` variant, only if Jack agrees).

## Decided at checkpoint 1
Q1 to Q3 are per-job registry fields (section 2). Q4: token + confirm + JSON rule.
