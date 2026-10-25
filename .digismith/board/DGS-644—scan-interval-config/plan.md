# DGS-644: the scan interval is a config setting

Spec and plan in one page. Mode Manual: the Maestro approves this page before the build. Protected paths touched: `.digismith/config.yml`, `scripts/nexus-api/src/scheduler/`, `packages/cli/src/autonomous/`.

## Spec

**Setting.** `nightwatch.scan_every_minutes: 30` in `.digismith/config.yml`. Default and fallback: 30. Valid: a whole number from 5 to 720 (the scheduler's own limits, `validateJobs`).

**Where it is read.** At every scheduler tick (30 s) and every job snapshot. A change needs no API restart. The scheduler reads `<MAIN_CHECKOUT>/.digismith/config.yml` (the same checkout the job already runs `dg` from). Cost: one small file read per tick. A read error means fallback 30.

**Why two readers.** The installed Nexus API is a self-contained copy (`~/.digismith-depot/nexus-api/src`): it cannot import `packages/cli`. So:
- The CLI guardrails parser (`guardrails.ts`) learns the key and exports `parseScanInterval(text) -> { minutes, problem }`. It is the judge of record.
- The API gets a small reader (`scheduler/scan-interval.ts`) with the same rule, and a test that runs both on the same cases so they cannot drift.

**Not a guardrail stop.** A bad `scan_every_minutes` does NOT go into `Guardrails.problems` (that list stops the scan and the merge gate). It goes into a new `scanProblems` list. The scan keeps working at 30.

**Fallback and attention item.** Bad value (4, 721, "x", 7.5, empty, set twice) or a read error: the interval is 30 and the watchdog (`dg autonomous watch`, every 5 min, already opens `bad-budget-config`) opens an item: run `-`, kind `failed`, cause `bad-scan-interval-config`. The CLI process writes it, never the scheduler process. It closes on the first watchdog pass that reads a clean value. A MISSING key is not a problem: default 30, no item.

**Engine.** `JobDef` gets an optional `scheduleOf?: () => JobSchedule`. The engine uses one helper `scheduleOf(job)` (`job.scheduleOf?.() ?? job.schedule`) in its five places that read `job.schedule`. Only `autonomous-scan` sets `scheduleOf`; `everyMinutes: 5` stays as the static default of the other three jobs. Slots stay anchored at 00:00 UTC+7, so 30 minutes means :00 and :30. A change mid-day takes effect at the next slot of the new grid; missed slots of the old grid are skipped as `catch: skip` already does.

**Status.** `dg autonomous status` gets one line: `scan interval: 30 min (config)` or `scan interval: 30 min (fallback: <problem>)`. It reads `<repo>/.digismith/config.yml` through the same parser.

**Docs.** `WATCHDOG.md` (the key, the fallback, the item), the comment on `autonomous-scan` in `registry.ts`, and the `autonomous` section of the factory definition comment in `config.yml` (a comment above the key).

**Tests.**
1. Parser: 30, 5, 720 good; 4, 721, "x", 7.5, empty, duplicate bad with a problem and minutes 30; missing key gives 30 and no problem.
2. Parser cross-check: CLI parser and API reader give the same answer on every case.
3. Guardrails: a bad `scan_every_minutes` leaves `problems` empty (scan and merge gate unaffected); an unknown key still fails.
4. Engine: `scheduleOf` changing between two ticks changes the next slot (no restart).
5. Registry: `autonomous-scan` resolves to 30 by default; `nightwatch-watchdog`, `schedule-release`, `oculus-tokens` stay at 5; daytime slot count for 30 min between 09:00 and 18:00 UTC+7 is 18.
6. Watchdog: a bad value opens one `bad-scan-interval-config` item (no duplicate on the next pass); a clean value closes it; a missing key opens nothing.
7. Status: prints the interval in force, and the fallback text for a bad value.

**First use (conductor, after the merge).** Install nexus-api, restart it, read back the job schedule (`autonomous-scan` 30, the other three 5). Change the value once (for example 15), read the schedule back without a restart, set it back to 30.

## Plan

### Task 1: Parser `parseScanInterval` and `scanProblems` (CLI)
Test first (tests 1, 3). Add the key to `readGuardrails` in `packages/cli/src/autonomous/guardrails.ts`; export `parseScanInterval` and `DEFAULT_SCAN_EVERY_MINUTES = 30`. Runs under `--experimental-strip-types`.

### Task 2: API reader and per-tick schedule
Test first (tests 2, 4, 5). Add `scripts/nexus-api/src/scheduler/scan-interval.ts` and `scheduleOf` in `types.ts`; engine helper at its five uses; `registry.ts` `autonomous-scan` uses `scheduleOf` reading the config; validate the resolved value with the existing `everyMinutes` rule.

### Task 3: Watchdog item
Test first (test 6). In `packages/cli/src/autonomous/watch.ts` open and close `bad-scan-interval-config` next to the budget item.

### Task 4: Status line
Test first (test 7). `statusLines` in `packages/cli/src/autonomous/index.ts`.

### Task 5: Config key and docs
Add `scan_every_minutes: 30` with a comment to the `nightwatch:` block in `.digismith/config.yml`; update `WATCHDOG.md` and the `registry.ts` comment. Run CLI and nexus-api tests.
