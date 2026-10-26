# DGS-498 spec: git drift alarm

Refined 2026-10-26 (UTC+7) from the parked spec (branch `DGS-498__drift-alarm`, cf8d851). Every claim was re-checked against `origin/main` and with a test repo (git 2.50.1).

## Goal
Make line-ending and mode drift visible. Every checkout has `core.autocrlf=input` and `core.fileMode=false` (DGS-478), so `git status` hides this drift. The check must see past that config. The incident: MEGA sync rewrote about 300 files to CRLF and mode 0600; nobody saw it for 3 days and two merges were blocked.

## What changed since the parked spec
1. **Counting bug fixed.** The parked spec used `git diff --ignore-cr-at-eol --name-only` as "files with a real change". Tested: `--name-only` still lists a CRLF-only file, so eol drift would always count 0. Fix: use `--numstat -z`. A CRLF-only file is absent from `--numstat` output, a really changed file is present. (Test repo: `crlf.txt` CRLF only, `real.txt` edited, `both.txt` CRLF plus edit. `--name-only` listed all three, `--numstat` listed `real.txt` and `both.txt` only.)
2. **Hook shape moved.** `hooks/hooks.json` now has three SessionStart commands (session cards, session-init, run-events with a depot guard). The alarm is a fourth command in the same list.
3. `scripts/workbox-health/` and `install.sh` are unchanged on `origin/main`. No drift check exists yet (`notes-drift.ts` is a different thing: DGS-443).

## Design
One script, `scripts/workbox-health/drift-check.ts`. Node built-ins and git only. Run with `node --experimental-strip-types`.

### Counting, per checkout
Every git call uses `GIT_OPTIONAL_LOCKS=0` (git never writes the index) and `-c core.autocrlf=false` (the repo config cannot hide drift). Diffs use `--no-renames --ignore-submodules=all`.
- A = `git -c core.fileMode=false diff --name-only -z`: files whose bytes differ (a CR counts).
- B = `git -c core.fileMode=false diff --no-renames --ignore-cr-at-eol --numstat -z`: files with a real change. A binary file shows as `-  -` and is a real change. A deleted file is a real change.
- **eol drift** = A minus B. A file with CRLF plus a real edit is in B, so it is never counted (the Emma repos carry real work).
- **mode drift** = entries of `git -c core.fileMode=true diff --raw -z` whose old mode differs from the new mode, and whose path is not in A.
  Reason for `--raw`: the mode columns are exact, so no text parsing of `--summary` is needed. Same data as the ticket's `--summary`.
- Each repo gets a timeout of 20 s per git call. On timeout the repo is reported as `check failed (timeout)`, not as clean (reason: a silent "clean" on a failed check is the exact blind spot this ticket removes).
- A repo with `* text=auto` in `.gitattributes` normalises CRLF in diff. It shows no eol drift. That is correct: git sees no change there.

### Discovery
- Default root `~/Workspace`, override `--root`. Walk up to depth 6 (repos sit at depth 2-3, worktrees one level deeper; the bound keeps the walk fast).
- A `.git` directory or `.git` file marks a checkout. Linked worktrees count (each has its own working tree, so each can drift). Keep walking inside a checkout for nested ones; never enter `.git`, `node_modules`, `.debris` (the debris folder holds old copies, not live checkouts).
- Emma and Soveron checkouts under `~/Workspace` are read like any other (the ticket says "each git checkout under ~/Workspace"). The check never writes there.
- A `.git` file whose `gitdir:` path does not exist (a relative path resolves against the checkout) gives a **broken link** result. No crash, no git call.

### Output
- Clean repos print nothing. A drifting repo prints `<repo>: <n> eol, <m> mode`. A broken one prints `<repo>: broken git link (<gitdir>)`. A failed one prints `<repo>: check failed (<reason>)`.
- `<repo>` = path relative to the root (`Jazurite/DigiSmith`, `Jazurite/DigiSmith/.worktrees/dgs-498`). A path outside the root stays absolute.
- Exit 0 when clean, 1 on any drift, broken link or failed check.
- Flags: `--root <dir>`, `--repo <path>` (one checkout only, found with `git rev-parse --show-toplevel`), `--json` (array of `{repo, eol, mode, broken, error}` for every checkout, clean ones too), `--no-log`, `--alarm`.
- CSV: `$DIGISMITH_DEPOT_DIR` or `~/.digismith-depot/observability/drift.csv`, header `time_utc7,repo,eol,mode,note`. One line per checked repo per run, clean ones too (reason: a trend shows when a repo recovers). Broken link or failed check: eol and mode empty, note `broken-link` or `check-failed`.
- Read-only: no restore, no stage, no config change. The only file it writes is the CSV.

### Alarm at session start
- `--alarm` (used by the hook): checks the current checkout only (`--repo "$PWD"`). Prints exactly one line, `DigiSmith: drift alarm: <repo> <n> eol, <m> mode (DGS-498)`, when eol+mode > 0. Prints nothing otherwise. Always exits 0. Never writes the CSV (reason: one line per session start would flood the log). Swallows every failure silently (a hook must not break a session). Outside a git checkout: silent.
- The hook is a fourth command in the existing `SessionStart` list in `hooks/hooks.json`: `node --experimental-strip-types "${CLAUDE_PLUGIN_ROOT}/scripts/workbox-health/drift-check.ts" --alarm --repo "$PWD"`.
- Cost: one `git diff` run, measured 0.04 s on the main checkout. No depot guard needed (the check reads only the repo).
- The alarm line comes from the session-start hook output, so the Maestro and every worker see it in their context.
- No LaunchAgent, no cron. The scheduled sweep is DGS-557 (Nexus scheduler); it will call `drift-check` without `--alarm`.

### workbox-health integration
- `workbox-health.sh` gets a "Git drift" section: it runs the installed `drift-check` (no `--alarm`, `--no-log` is not used so the CSV gets its line) and prints `  clean` when it exits 0, else the check's lines. If `drift-check` is not installed it says so and the script still ends normally.
- `install.sh` also installs `drift-check` into `~/.digismith-depot/bin/`. The installed file is a small bash wrapper that runs `node --experimental-strip-types` on a copy of `drift-check.ts` placed next to it (reason: the `.ts` needs the flag; a plain copy would not run directly; same depot-runs-a-copy rule as DGS-265).

## Tests (Vitest, temp git repos, repo config as on the Workbox)
CRLF only, mode only, real change only, CRLF plus real change (not counted as eol), mixed, binary change, deleted file, clean, broken link, timeout reported as failed, `--json`, CSV line, exit codes, `--alarm` silent and loud, discovery skips `node_modules` and `.debris`, linked worktree found, read-only (HEAD, index and config unchanged).

## Out of scope
Scheduled sweeps (DGS-557), restoring files, fixing the MEGA sync setting.
