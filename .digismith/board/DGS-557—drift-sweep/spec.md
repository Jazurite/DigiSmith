# DGS-557 spec: scheduled drift sweep of every checkout

Date: 2026-10-26 (UTC+7). Status: draft for Jack's approval. Docs only; nothing is built.
Waits on DGS-498. Facts checked against `origin/main` on 2026-10-26.

## Goal
Find line-ending and mode drift in a repo nobody opens (Emma's checkouts, Library clones) within minutes. DGS-498 only checks the repo of the current session. This ticket runs the all-repo sweep on a schedule and reports through the same alarm line and `drift.csv`.

## What DGS-498 gives us (interface this spec relies on)
From the parked spec on branch `DGS-498__drift-alarm` (cf8d851). It is not on main yet.
- `scripts/workbox-health/drift-check.ts`, run with `node --experimental-strip-types`. Node built-ins and git only.
- Per checkout: `eol` count and `mode` count, or `broken` for a dead `.git` link. Read-only. Discovery under `--root` (default `~/Workspace`, depth 6, worktrees count).
- `--alarm --repo <path>`: prints `DigiSmith: drift alarm: <repo> <n> eol, <m> mode (DGS-498)` or nothing; exit 0; never writes the CSV.
- CSV `~/.digismith-depot/observability/drift.csv`, header `time_utc7,repo,eol,mode,note`.
- `install.sh` puts `drift-check` and a copy of `drift-check.ts` in `~/.digismith-depot/bin/`.

If DGS-498's final spec changes any of these, this spec follows it.

## Decision 1: which scheduler (decided)
**The Nexus scheduler (DGS-456, on main), as a new registry job `drift-sweep`.** Not a conductor duty, not a LaunchAgent, not cron.

What main offers today (`scripts/nexus-api/src/scheduler/registry.ts`): jobs are plain data in `JOBS`: a name, a clock rule (`schedule` with `everyMinutes`), one fixed command run with `execFile`, a timeout, `catchUp`, `order`, `notify`. The engine runs it as a child process, one job at a time, logs each run in the depot, and comments on DGS-436 when a run fails. Five jobs run that way already (`autonomous-scan`, `autonomous-report`, `nightwatch-watchdog`, `schedule-release`, `oculus-tokens`).

Reasons:
- The sweep spends no model tokens. A conductor duty needs a live model session and costs tokens at every tick.
- The sweep must run when no session is open. A repo nobody opens is the case this ticket exists for.
- The scheduler already gives timeout, overlap protection, run log and failure comment. A new job is one registry entry, no engine change.
- House rule: no LaunchAgent and no cron. The Nexus API's one existing LaunchAgent is the only keep-alive.

## Decision 2: how often (decided)
**Every 10 minutes, all day:** `schedule: { atUtc7: '00:00', windowEndUtc7: '23:59', everyMinutes: 10 }`.
Reason: the ticket says "within minutes". Drift comes from a tool rewriting files, and 10 minutes is short enough to catch it before work builds on it. A sweep is a few `git diff` calls per repo, so cost is small. A constant in the registry, not a config key (YAGNI; the watchdog's config key exists because Jack tunes it, here nobody asked).
Other fields: `catchUp: 'skip'` (an old sweep has no value, the next one is soon), `order: 80`, `timeoutMs: 4 min`, `notify: 'failures'`, `manualOutsideWindow: 'allowed'`.

## Decision 3: the job command (decided)
`process.execPath --experimental-strip-types ~/.digismith-depot/bin/drift-check.ts --sweep`.
Reasons:
- The depot copy that DGS-498's `install.sh` installs is stable. It does not change when the main checkout changes branch.
- `process.execPath` is the Node that runs the API, so the LaunchAgent's short `PATH` does not matter. The scheduler design (section 6) flags that risk. The bash wrapper from DGS-498 would depend on `PATH`, so the job does not use it.
- Absolute paths only, as `validateJobs` requires.
If `drift-check.ts` is missing, node exits non-zero, the run is `failed` and the scheduler comments on DGS-436. That is the right alarm.

## Design: what the new `--sweep` mode does
One new mode in `drift-check.ts`. It reuses the DGS-498 counting and discovery code. No second implementation.

1. Discover every checkout under `--root` (default `~/Workspace`) and count each one as in DGS-498.
2. Each repo has its own limit of 30 s. A repo that hits it is reported with note `timeout` and does not stop the sweep. One broken repo must not hide drift in the others.
3. Write the **sweep state** `~/.digismith-depot/observability/drift-sweep.json`, atomically (temp file, rename): `{ ranAtUtc7, ranAt, repos: [{ repo, eol, mode, broken, note }] }`. It holds every checked repo.
4. Append to `drift.csv` **only when a repo's result changed since the previous sweep**: it starts to drift, drift count changes, it recovers, or it is seen for the first time. Notes: `sweep`, `sweep:recovered`, `broken-link`, `timeout`.
   Reason: DGS-498 writes one line per repo per run, which is right for a manual run. A sweep every 10 minutes over about 40 checkouts would write about 5,800 lines a day. Change-only lines still show when drift started and when it ended, which is the trend DGS-498 wants.
5. Print the same lines as a normal run (`<repo>: <n> eol, <m> mode`). The scheduler keeps the last 2,000 characters in the run log.
6. **Exit 0 whenever the sweep itself worked, even when drift is found.** Exit non-zero only when the sweep cannot run (no root, state file not writable, crash).
   Reason: the scheduler turns a non-zero exit into a failed run and a ClickUp comment on DGS-436, at most one per job per hour. Persistent drift would then comment every hour for days, and a real sweep failure would hide among them. Drift goes to the alarm line instead (below).

## How the alarm reaches Jack (decided)
"Same alarm line" means the SessionStart hook from DGS-498 prints it. A drifting repo nobody opens would never print its own alarm, so the hook also reads the sweep state.

`--alarm` gets one addition. After its own check of the current repo, it reads `drift-sweep.json` and, for every drifting or broken repo **other than the current one**, prints one more line:

`DigiSmith: drift alarm (sweep <HH:MM UTC+7>): <repo> <n> eol, <m> mode; <repo> ...  (DGS-557)`

- At most 5 repos in the line, then `and <k> more`. The line stays one line.
- Nothing is printed when no other repo drifts.
- If `drift-sweep.json` is older than 60 minutes, or missing after the job has been installed, the hook prints `DigiSmith: drift sweep has not run since <time> (job drift-sweep)`. Reason: a dead sweep must not look like a clean one. A missing file before the first sweep ever ran prints nothing.
- Same safety rules as DGS-498: always exit 0, never write the CSV, swallow every error silently, read-only.
- No new hook and no change to `hooks/hooks.json`.

## `workbox-health`
The "Git drift" section from DGS-498 stays as is. It runs the installed `drift-check` live. No change.

## Files
- `scripts/workbox-health/drift-check.ts` and `.test.ts`: `--sweep`, per-repo limit, state file, change-only CSV, alarm addition.
- `scripts/nexus-api/src/scheduler/registry.ts` and `registry.test.ts`: the `drift-sweep` job.
- `scripts/nexus-api/install.sh` is not changed: the registry is already copied to the depot. The API must restart once to load the new job (Jack's step, `launchctl kickstart -k`, as in DGS-456).
- Docs: one short paragraph in the workbox-health notes (what the sweep covers, where the state file is).

## Tests (Vitest, temp git repos, repo config as on the Workbox)
- Sweep finds drift in two repos, a clean one, a broken link; state file holds all of them.
- CSV: first sweep writes the drifting repos; an unchanged second sweep writes nothing; a recovery writes one `sweep:recovered` line.
- A repo that exceeds its limit (fake slow git) is reported `timeout` and the others still run.
- Exit 0 with drift; non-zero when the root is missing.
- Alarm: other repo drifting gives the second line; more than 5 gives `and <k> more`; stale state gives the stale line; fresh and clean prints nothing; the current repo is not repeated in the sweep line.
- Read-only: HEAD, index and config of every repo unchanged after a sweep.
- Registry: the job validates (`validateJobs`), uses an absolute path, `everyMinutes` 10, `catchUp` skip.
- First use on the Workbox (agent, no Jack): `run now` of `drift-sweep` through the scheduler with the token file; the run is `ok`, the state file lists the real checkouts (Emma, Library, Jazurite), and the run takes under 4 minutes. This proves the LaunchAgent's short `PATH` finds `git`.

## Risks
- `git` on the LaunchAgent's `PATH`: macOS has `/usr/bin/git`. Proved by the first-use run. If it fails, the script calls `/usr/bin/git` by absolute path.
- Big repos (Library clones): the 30 s limit per repo and the 4 minute job timeout contain them.
- A sweep runs `git diff` while a session edits the same repo. `GIT_OPTIONAL_LOCKS=0` means git never writes the index, so it cannot block that session.

## Out of scope
- Restoring or fixing drifted files (read-only, as DGS-498).
- Push or email alerts (DGS-448 is not built; the notifier list can take it later).
- Putting drift into the Nightwatch attention list (a separate ticket if Jack wants it).
- A config key for the interval.
- Emma and Soveron workspaces beyond reading them in the sweep and the first-use run.
