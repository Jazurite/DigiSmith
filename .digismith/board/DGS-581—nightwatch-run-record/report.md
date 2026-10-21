# DGS-581 report: Nightwatch run record and event log

Times are UTC+7 first. Branch `DGS-581__nightwatch-run-record`, base `df78a81` (main after DGS-572). Commit hashes in `report.html` are the hashes on the branch now; the merge rebases onto main again and changes them.

## What shipped
- `dg run start|event|list|show|tail` (`packages/cli/src/run/`).
- A frozen `run.json` per run and an append-only `events.jsonl` in `~/.digismith-depot/runs/<KEY>/<run-id>/` (`$DIGISMITH_DEPOT_DIR` overrides the root).
- Five new hook commands in `hooks/hooks.json` (SessionStart, Notification, PostToolUse, Stop, SessionEnd) that start no node process when `DIGISMITH_RUN_ID` is empty.
- Conductor event types: `review_ready`, `merged`, `pushed`, `lost`, `phase` (`data.phase` is building, review or merge).
- Every hook event carries the `session_id` of the session that fired it. `summary.ended` is true only when an `ended` comes after the last `started` (a /clear is not an end). `--order` is required.
- Spec: `design.html`. Plan: `plan.md`. Review findings: `findings.md` (22 rows, 3 parked). Full record: `report.html`.

## The file-order rule (Maestro ruling)
Each event line is one `O_APPEND` write, so the file line order is the authority. `seq` is a strong hint, not a unique key. The stale-lock break has a very small race left (a writer paused between two adjacent syscalls, and only after a crashed writer held the lock for more than 2 s); it can give two lines the same `seq`. Task 2 findings F1 and F4 are parked for this reason. `dg run tail`, `show` and `list` order by file position and tolerate a duplicate `seq`; DGS-582, 583 and 586 must do the same. `tail --since N` keeps lines with `seq` greater than N, so a follower that uses it as a cursor may miss a line that repeats a seq it already passed. A follower that must not miss a line re-reads the file and counts lines.

## Runbook text block (the conductor applies this at merge)
The runbook `.digismith/sessions/workbox.md` is git-excluded and no tracked start script exists in `scripts/conductor/`, so the change is this block, also saved as `runbook-block.md` in the board folder:

```
Worker start, new step before the worker is started (DGS-581):
  RUN_ID=$(dg run start --ticket <KEY> --role <builder|reviewer|scout> --order <order path> \
           --seat <seat> --model <model> --worktree <worktree dir> --workspace <w> --tab "<tab label>" --pane <pane>)
--order is required: a Scout without an order file passes the path of its brief.
Start the worker with DIGISMITH_RUN_ID=$RUN_ID in its environment (with DIGISMITH_REVIEW_MODE=role for a Builder).
A retry, a new Reviewer or a new Scout runs dg run start again and gets a new id. Never reuse an id.
After the start, check: dg run show $RUN_ID. Events appear as the worker works: started, tool, blocked, turn_end, ended.
The conductor writes the lifecycle events no hook can see: dg run event $RUN_ID review_ready|merged|pushed|lost [--data '{...}'].
The conductor also marks the phase: dg run event $RUN_ID phase --data '{"phase":"building|review|merge"}'.
File order is the authority for events. Readers must not rely on seq being unique.
First use after the merge and plugin update: start a throwaway worker this way, trigger one prompt and one permission
prompt, close it, then dg run show must list started, tool, blocked, turn_end, ended in seq order.
```

## Hook speed
The ticket target was under 100 ms per hook. Measured on a quiet machine: a warm hook call took about 131 ms (160 to 257 ms in the Builder's runs under load); a bare `node -e 0` took about 79 ms. The Reviewer measured 120 ms for a call alone. On a loaded machine the numbers swing a lot (bare node 0.14 to 0.38 s, hook 0.48 to 0.55 s in my last noisy run). So almost all of the time is node start-up plus the type-stripping loader, not the handler: the handler adds about 50 ms at most. The hook tests use a loose 3000 ms ceiling and print the measured time.
**Recommendation for a later ticket (not done here):** ship a built single-file `.js` hook (compiled once, no `--experimental-strip-types`, no TypeScript loader) and point `hooks.json` at it. That should bring a hook close to the bare node start. It needs a build step in the plugin release, so it is its own ticket. `PostToolUse` fires most often, so it gains the most.

## Accepted residuals and parked findings
- Task 2 F1 and F4: the stale-lock race above (Maestro ruling).
- Task 6 F2: the end-to-end test calls the library and spawns only the `hooks.json` commands. A spawned root CLI imports the `clickup-client` dist, which the cli e2e test's `pnpm build` deletes at the same moment; that made `index.test.ts` flaky 3 of 3 runs. The `dg run` commands are covered in process, including a root-registration test.
- If a breaker moves a fresh lock aside before its holder writes the owner file, waiters may wait up to about 1 s. This only delays.
- A permission prompt, `blocked`, and `started` wait up to 2 s for the lock; `tool` waits 150 ms and then drops its event and logs it (`<depot>/runs/hook-errors.log`).

## What is tested without Jack
Fake depot dir (`DIGISMITH_DEPOT_DIR`), fake stdin payloads, two and three parallel writers, a stale lock, a live holder, the `/clear` sequence, a duplicate-seq fixture, the `hooks.json` commands through `sh -c` with a `node` shim (no node process starts without `DIGISMITH_RUN_ID`), secrets in a payload never reach the file. The whole suite passed after the rebase: 205 files, 3016 tests (3020 after the last fix wave); the cli build is clean.

## First use (the conductor's, after merge and plugin update)
Apply the runbook block, start a throwaway worker through it, trigger one prompt and one permission prompt, close it, then `dg run show <id>` must list `started`, `tool`, `blocked`, `turn_end`, `ended` in file order. A plain Claude session without `DIGISMITH_RUN_ID` must leave `runs/` unchanged.

## Notes for the conductor
- A worker scratch `mv` once moved the pre-existing `/tmp/x` directory into the worktree and back (Task 5 implementer). It is intact; nothing from it was committed.
- Steward and other child `claude -p` sessions inherit `DIGISMITH_RUN_ID` and write into the same run; their events carry their own `session_id`.
