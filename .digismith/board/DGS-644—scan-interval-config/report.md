# DGS-644 implementation report

Date: 2026-10-25 (UTC+7). Branch `DGS-644__scan-interval-config`, rebased on main `58e89c55`, 11 commits. Sign-off: Maestro (attended, protected paths).

## What shipped

- `nightwatch.scan_every_minutes: 30` in `.digismith/config.yml` (whole number 5 to 720, default and fallback 30), with a comment. The Nexus job `autonomous-scan` runs every 30 minutes instead of 5. `nightwatch-watchdog`, `schedule-release` and `oculus-tokens` stay at 5 (tested).
- The scheduler reads the setting at every tick: `JobDef.scheduleOf`, the engine helper, `scanScheduleOf` in `registry.ts`. A change needs no API restart. The installed API cannot import the CLI, so `scheduler/scan-interval.ts` is a second reader of the same rule; a test runs both on the same cases and compares the problem text, including file-level cases.
- A bad or missing value is not a guardrail problem: the scan and the merge gate go on at 30. `dg autonomous watch` opens one `bad-scan-interval-config` item (run `scan-interval`) and closes it on the first clean pass; the scheduler logs one fixed-field line per change.
- An interval change no longer writes a burst of skipped records: slots before the last handled slot count as handled (`slotKeyMs`, grid independent).
- `dg autonomous status` prints `scan interval: N min (config)` or `(fallback: <problem>)`.
- Added beyond the plan (Maestro accepted): `dg autonomous watch --repo <dir>`; the scheduled watchdog passes the main checkout, so the job sees the real config (it ran in the API's working directory before). `nightwatch.budgets` is not set today, so no budget changes.
- Docs: `WATCHDOG.md` "The scan interval", comments in `registry.ts` and `config.yml`.

## Reviews

Five task reviews and one ticket review (claude-opus-5-5, clean). Task 2 had one Important finding (the skipped burst) and a scoped second review, clean. All other findings were Minor and are fixed. The table is in `findings.md`.

## Gates (after the rebase)

- `scripts/nexus-api` whole suite: 466/466.
- `packages/cli` `src/autonomous`: 846/846. `strip-types.smoke.test.ts`: 8/8.
- Whole CLI suite before the rebase: 2469 pass, 3 fail in `strip-types.smoke` only (build race with `index.e2e.test.ts`, which deletes the clickup-client `dist`); without the e2e file 2469/2469. Known from DGS-635.
- No web files touched, no web gate.

## Next (the conductor)

Install the nexus-api, restart it and read back the job schedule (`autonomous-scan` 30, the other three 5). Change the value once (for example 15), read the schedule back without a restart, and set it back to 30.
