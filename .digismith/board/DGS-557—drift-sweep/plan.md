# DGS-557 Drift Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Nexus scheduler job `drift-sweep` runs `drift-check --sweep` every 10 minutes over every checkout under `~/Workspace`, and the session-start alarm shows what it found.

**Architecture:** `--sweep` is one new mode in DGS-498's `scripts/workbox-health/drift-check.ts`, reusing its counting and discovery. It writes a state file and change-only CSV lines. `--alarm` reads the state file. One registry entry runs the depot copy of the script. Spec: `spec.md` in this folder (approved by Jack 2026-10-26, wording kept).

**Tech Stack:** Node (`--experimental-strip-types`), git, Vitest, the Nexus scheduler registry. pnpm only.

## Global Constraints
- Blocked until DGS-498 is merged to main. Start only after `scripts/workbox-health/drift-check.ts` exists on main; if its exported names differ from the ones used below, use the real names and keep the behaviour.
- No LaunchAgent, no cron. The job is a registry entry; the scheduler engine is not changed.
- Read-only: every git call uses `GIT_OPTIONAL_LOCKS=0`. No restore, no stage, no config change.
- Sweep: interval `everyMinutes: 10`, window `00:00` to `23:59`, `catchUp: 'skip'`, `order: 80`, `timeoutMs: 4 * 60 * 1000`, `notify: 'failures'`, `manualOutsideWindow: 'allowed'`.
- Per-repo limit 30 s (`REPO_LIMIT_MS = 30_000`).
- State file: `~/.digismith-depot/observability/drift-sweep.json` (override with `$DIGISMITH_DEPOT_DIR`, as the CSV). CSV `drift.csv`, header `time_utc7,repo,eol,mode,note`.
- Exit 0 when the sweep ran, even with drift. Non-zero only when it cannot run.
- Alarm wording (kept by Jack): `DigiSmith: drift alarm (sweep <HH:MM UTC+7>): <repo> <n> eol, <m> mode; <repo> ...  (DGS-557)`, at most 5 repos then `and <k> more`; stale line `DigiSmith: drift sweep has not run since <time> (job drift-sweep)` when state is older than 60 minutes.
- `--alarm` always exits 0, never writes the CSV, swallows every error.
- Commits: title-only conventional commits, no AI attribution. Times UTC+7 first.

## File Structure
- Modify `scripts/workbox-health/drift-check.ts`: `--sweep`, state file, change-only CSV, alarm addition.
- Modify `scripts/workbox-health/drift-check.test.ts`: tests for all of it.
- Modify `scripts/nexus-api/src/scheduler/registry.ts` and `registry.test.ts`: the job.
- Modify the workbox-health notes (find the file that documents `drift-check` from DGS-498): one paragraph.

### Task 1: Sweep mode, state file and change-only CSV

**Files:**
- Modify: `scripts/workbox-health/drift-check.ts`
- Test: `scripts/workbox-health/drift-check.test.ts`

**Interfaces:**
- Consumes (from DGS-498): the per-checkout count function, the discovery function, the CSV append helper, the UTC+7 time formatter. Use their real names.
- Produces:
  ```ts
  export interface SweepRepo { repo: string; eol: number | null; mode: number | null; broken: boolean; note: string }
  export interface SweepState { ranAt: string; ranAtUtc7: string; repos: SweepRepo[] }
  export const REPO_LIMIT_MS = 30_000
  export function runSweep(opts: { root: string; stateFile: string; csvFile: string; now: () => Date; count: (repo: string, limitMs: number) => SweepRepo }): SweepState
  export function changedRepos(prev: SweepState | null, next: SweepState): { repo: SweepRepo; note: 'sweep' | 'sweep:recovered' | 'broken-link' | 'timeout' }[]
  ```
  CLI: `--sweep` (with the existing `--root`) calls `runSweep`, prints one `<repo>: <n> eol, <m> mode` or `<repo>: broken git link (<gitdir>)` line per drifting repo, exits 0.

- [ ] **Step 1: Write the failing tests** (temp git repos with `core.autocrlf=input` and `core.fileMode=false`, a temp depot dir)
  - Two drifting repos, one clean, one broken link: `runSweep` returns all four in `repos`; the state file holds the same.
  - `changedRepos(null, state)` returns the drifting and broken repos only (a clean repo seen first time is not a change worth a line).
  - A second sweep with no change: CSV has no new line.
  - A repo that drifted and is now clean: one new line with note `sweep:recovered`, eol and mode `0`.
  - A repo whose count changes from 1 to 3 eol: one new line.
  - `count` that returns `note: 'timeout'` for one repo: that repo is in the state with note `timeout`, the other repos are still counted.
  - CLI: exit 0 with drift present; exit 1 with a missing `--root`.
  - Read-only: HEAD, index and `.git/config` of every repo are byte-identical after a sweep.
- [ ] **Step 2: Run to verify it fails**
  Run: `pnpm vitest run scripts/workbox-health/drift-check.test.ts`
  Expected: FAIL, `runSweep` not defined.
- [ ] **Step 3: Implement**
  - `runSweep`: discover, count each repo with `REPO_LIMIT_MS` (the real count wraps the git calls with `execFileSync(..., { timeout })`; a timeout error becomes `{ eol: null, mode: null, broken: false, note: 'timeout' }`), build the state, read the previous state file (missing or unreadable = `null`), append the `changedRepos` lines to the CSV (`time_utc7,repo,eol,mode,note`), write the state atomically (write `<file>.tmp`, `renameSync`).
  - `changedRepos`: compare by `repo`. Changed = new and drifting or broken or timeout; or `eol` or `mode` or `broken` or `note` different from the previous result. Recovery = previous drifting or broken, now clean: note `sweep:recovered`.
  - Wire `--sweep` into the CLI. State and CSV paths come from `$DIGISMITH_DEPOT_DIR` or `~/.digismith-depot/observability/`.
- [ ] **Step 4: Run to verify it passes** (same command; Expected: PASS)
- [ ] **Step 5: Commit**
  ```bash
  git add scripts/workbox-health/drift-check.ts scripts/workbox-health/drift-check.test.ts
  git commit -m "feat(dgs-557): add the drift-check sweep mode"
  ```

### Task 2: Alarm reads the sweep state

**Files:**
- Modify: `scripts/workbox-health/drift-check.ts`
- Test: `scripts/workbox-health/drift-check.test.ts`

**Interfaces:**
- Consumes: `SweepState`, the state file path helper from Task 1, the existing `--alarm` code path.
- Produces:
  ```ts
  export function sweepAlarmLines(state: SweepState | null, currentRepo: string, now: Date): string[]
  ```
  Returns zero, one or two lines. `--alarm` prints its own line for the current repo first, then these lines.

- [ ] **Step 1: Write the failing tests**
  - Another repo drifting, state fresh: one line `DigiSmith: drift alarm (sweep 14:05 UTC+7): Emma/shopify-dev 2 eol, 0 mode  (DGS-557)`.
  - Seven drifting repos: five named, then `and 2 more`.
  - Only the current repo drifting: no sweep line (its own alarm line covers it).
  - All clean, state fresh: no line.
  - State older than 60 minutes: the stale line with the `ranAtUtc7` time.
  - State file missing: no line. State file with broken JSON: no line, exit 0.
  - `--alarm` never writes the CSV.
- [ ] **Step 2: Run to verify it fails**
  Run: `pnpm vitest run scripts/workbox-health/drift-check.test.ts -t alarm`
  Expected: FAIL.
- [ ] **Step 3: Implement** `sweepAlarmLines`, call it from the `--alarm` path inside the existing try/catch that swallows errors. The repo name in the line is the path relative to the root, as DGS-498 prints it. The sweep line uses two spaces before `(DGS-557)` exactly as in the wording above.
- [ ] **Step 4: Run to verify it passes** (the whole file; Expected: PASS)
- [ ] **Step 5: Commit**
  ```bash
  git add scripts/workbox-health/drift-check.ts scripts/workbox-health/drift-check.test.ts
  git commit -m "feat(dgs-557): show the sweep result in the drift alarm"
  ```

### Task 3: The scheduler job and the docs

**Files:**
- Modify: `scripts/nexus-api/src/scheduler/registry.ts` (add to `JOBS`, after `oculus-tokens`)
- Test: `scripts/nexus-api/src/scheduler/registry.test.ts`
- Modify: the workbox-health notes file from DGS-498

**Interfaces:**
- Consumes: `defineJob`, `validateJobs`, `homedir`, `join` (already imported in `registry.ts`).
- Produces: the job `drift-sweep`.

- [ ] **Step 1: Write the failing test** in `registry.test.ts`: `JOBS` has a job named `drift-sweep` with `command.file === process.execPath`, `args` equal to `['--experimental-strip-types', <home>/.digismith-depot/bin/drift-check.ts, '--sweep']`, `schedule.everyMinutes === 10`, `catchUp === 'skip'`, `timeoutMs === 240000`; `validateJobs(JOBS)` does not throw.
- [ ] **Step 2: Run to verify it fails**
  Run: `cd scripts/nexus-api && pnpm vitest run src/scheduler/registry.test.ts`
  Expected: FAIL, job missing.
- [ ] **Step 3: Implement**
  ```ts
  const DRIFT_CHECK = join(homedir(), '.digismith-depot', 'bin', 'drift-check.ts')
  ```
  and the entry:
  ```ts
  defineJob({
    name: 'drift-sweep',
    description: 'Finds line-ending and mode drift in every checkout under ~/Workspace; writes drift-sweep.json for the session-start alarm. Read-only. No model tokens.',
    schedule: { atUtc7: '00:00', windowEndUtc7: '23:59', everyMinutes: 10 },
    command: { file: process.execPath, args: ['--experimental-strip-types', DRIFT_CHECK, '--sweep'] },
    timeoutMs: 4 * 60 * 1000, catchUp: 'skip', order: 80, notify: 'failures', manualOutsideWindow: 'allowed',
  }),
  ```
  Add one paragraph to the workbox-health notes: what the sweep covers, the state file path, the alarm lines, how to run it by hand (`node --experimental-strip-types ~/.digismith-depot/bin/drift-check.ts --sweep`).
- [ ] **Step 4: Run to verify it passes**
  Run: `cd scripts/nexus-api && pnpm vitest run`
  Expected: PASS, the existing route and scheduler tests unchanged.
- [ ] **Step 5: Commit**
  ```bash
  git add scripts/nexus-api/src/scheduler/registry.ts scripts/nexus-api/src/scheduler/registry.test.ts <the notes file>
  git commit -m "feat(dgs-557): schedule the drift sweep in the Nexus registry"
  ```

### Task 4: Install and first use (agent steps, one restart for Jack)

**Files:** none changed in the repo.

- [ ] **Step 1:** After merge, run `scripts/workbox-health/install.sh` (puts the new `drift-check.ts` in `~/.digismith-depot/bin/`) and `scripts/nexus-api/install.sh` (copies the registry to the depot).
- [ ] **Step 2 (Jack):** one restart of the Nexus API: `launchctl kickstart -k gui/$(id -u)/com.jazurite.digismith.nexus-api`.
- [ ] **Step 3:** Run now: `POST http://127.0.0.1:4300/api/v1/jobs/drift-sweep/run` with the token file, as in DGS-456's first-use steps. Check `/api/v1/jobs/drift-sweep/runs`: status `ok`, duration under 4 minutes.
- [ ] **Step 4:** Check `~/.digismith-depot/observability/drift-sweep.json` lists the Emma, Library and Jazurite checkouts. If the run failed because `git` is not found, change the script to call `/usr/bin/git` and repeat from Task 3.
- [ ] **Step 5:** Start a session in a drift-free repo while another repo has drift (make one with a CRLF-only change in a scratch clone under `~/Workspace`, remove it afterwards with Jack's order) and confirm the sweep line shows after the next sweep.

## Self-Review (spec against plan)
- Scheduler choice, interval, command: Task 3. Sweep mode, per-repo limit, state file, change-only CSV, exit codes: Task 1. Alarm line, cap of 5, stale line, no new hook: Task 2. `workbox-health` unchanged: no task needed. Risks (`git` on `PATH`, big repos, concurrent edits): Task 4 step 4, per-repo limit, `GIT_OPTIONAL_LOCKS=0`. Out of scope items have no task.
- Names match across tasks: `SweepState`, `SweepRepo`, `runSweep`, `changedRepos`, `sweepAlarmLines`, `REPO_LIMIT_MS`.

## Definition of Ready (Refiner check, 2026-10-26 UTC+7)
| Item | State |
|---|---|
| Spec | Done, approved by Jack 2026-10-26, wording kept. |
| Plan | Done (this file). Three build tasks and one install and first-use task. The plan checklist sync is skipped (docs only, nothing built). |
| Blockers | DGS-498 (drift-check itself). ClickUp shows DGS-557 depends on `14zcebrvzf7` (read from the task payload, not opened) and DGS-548 (Autonomous Operation) depends on DGS-557. DGS-498 is still in `refinement`, its code is parked on `DGS-498__drift-alarm` and is not on main. DGS-557 cannot start before DGS-498 merges. |
| Milestone | The task payload shows none. Proposed: the same milestone as DGS-498. Not set by me; the conductor or Jack sets it. Open work must not sit on a done milestone. |
| Mode | Proposed **Autonomous**. The build is three small tasks with tests, no taste decisions left, and nothing user-facing beyond the wording Jack approved. Jack's one step (the API restart) comes after the merge and does not need him during the build. |
| Sign-off | Proposed **Auto**. The result is proved by tests and by the agent's first-use run (state file lists the real checkouts, run `ok`). Change to **Jack** if he wants to see one real alarm line himself; the plan's Task 4 step 5 shows how. |
| Pitch comment | `dg clickup` cannot read comments and the conductor passed no text, so Mode and Sign-off are my own proposal from the description. |
