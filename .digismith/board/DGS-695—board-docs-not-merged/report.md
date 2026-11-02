# DGS-695 — Implementation Report

Ticket: DGS-695

## What changed
- `readMainLog` now reads the changed files too: one call `git -c core.quotepath=off log origin/main --no-renames --name-only --format=%x01%h%x09%s`. Rows are `{ sha, subject, files }`; a shared `parseLog` reads the format.
- New `isBoardDocs(key, files)`: files exist and every one starts with `.digismith/board/<key>—` (case-insensitive). `counts(row, want)` = key in scope and not board docs. Used by rule (a), rule (b) (branch log reads files too) and `blockerProblem`. `drift` and the scan guard get it through the log.
- `WATCHDOG.md` line on "already merged" states the rule. `index.ts` has no such text.
- A `docs(dgs-683)` refinement commit that only touches its own board folder no longer makes the scan skip the ticket as `already-merged`.

## Tests
- `already-done.test.ts` (real git, em dash in the folder name): board-only docs, mixed with code, another key's folder, `DGS-70` vs `DGS-7`, feat with board files only, empty and merge commits, rename out of `src/`, upper-case scope, lower-case folder, quoted filenames, `blockerProblem`, rule (b).
- `scan-guard.test.ts` and `drift.test.ts`: fixtures use a `logOf` helper in the new format; fakes match `args.includes("log")` because the call starts with `-c`. Three new tests plus one for drift.
- `src/autonomous`: 39 files, 948 tests. Whole package: 168 files, 2718 tests, all pass. Flags: `--pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=2` (`maxForks` alone fails: minThreads/maxThreads conflict).

## Review
Task 1 approved (2 Minor, fixed in 13ad33a5). Task 2 approved. Whole ticket: ready to merge, no findings. Protected path `packages/cli/src/autonomous/`: merge needs the Maestro.

## First use (conductor, after merge and install)
Throwaway ticket with a `docs(<key>)` board-only commit in a scratch clone: `dg autonomous scan --dry-run --repo <clone>` must show `ready`, not `already-merged`. Do not touch DGS-683.
