# DGS-664 report: conductor flux at the next idle

Date 2026-10-27 (UTC+7). Commit range 24371d6d..b9c97fcb. Ticket: DGS-664.

## What shipped
- `scripts/conductor/flux.ts`: the night window is gone (`NIGHT_WINDOW`, `inNightWindow`, `outside_night_window`, `checks.night`). The idle checks are the only gate. A worker in `target.workers` that herdr lists in any status blocks the flux. `IN_FLIGHT` also counts `to do`, `in progress`, `claimed`.
- `flux-cli.ts`, `cli.ts`: usage and header text state the idle rule. The usage text has no word "night" or "override".
- Tests: night tests removed; day, worker-status table, in-flight words and usage tests added.

## Reviews
- Task 1: Approved r1, no findings.
- Task 2: Approved r1, no findings. The reviewer accepted one deviation: the plan's test forbade "override" in the usage while the plan's own line used it, so two usage lines were reworded.
- Ticket final: Approved r1, no findings.
- Suite: `scripts/conductor`, 18 files, 324 tests pass.

## Not built here
- Plan Task 3 (first use): the conductor and the Maestro create `~/.digismith-depot/flux-targets.json`, run the dry run, then one watched flux. Nothing was run by the Builder.
- Texts outside the repo (main-conductor note, b3-maestro brief, memory file, runbook line): by hand.
- Follow-up for the Maestro (spec D5): a scheduled flux job is its own ticket under DGS-434/435. Ask Jack whether to open it.
