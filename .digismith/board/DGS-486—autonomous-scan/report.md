# DGS-486 report

## Mutation checks

Done by hand on 2026-10-21 (UTC+7). Each mutation was applied alone, the named test run, and the file restored with `git checkout -- <file>`; `git status --short` showed no tracked change after each restore. All paths are under `packages/cli/src/autonomous/`.

| # | Mutation | File and line changed | Test command | Failing tests | Restored |
|---|---|---|---|---|---|
| 1 | lock created without `wx` | `state.ts:28` (`acquireLock`, `{ flag: "wx" }` removed) | `pnpm vitest run packages/cli/src/autonomous/scan.test.ts` (and `state.test.ts`) | scan: "two scans at once: one claimed, one busy, one order file"; state: "acquires then reports busy", "gives exactly one acquired across separate processes", "gives exactly one acquired out of ten in-process calls" | yes |
| 2 | skip the status read-back | `scan.ts:53` (`claim`, read-back check deleted) | `pnpm vitest run packages/cli/src/autonomous/scan.test.ts` | "readBackWrong: lock gone, back to to do, claim-failed" | yes |
| 3 | `inNightWindow` bound `h < 6` to `h <= 6` | `clock.ts:2` | `pnpm vitest run packages/cli/src/autonomous/clock.test.ts` | "is true at 05:59:59 UTC+7 and false at 06:00" | yes |
| 4 | work rule moved after the tracker call | `scan.ts:80-84` moved below the `hasStatus` block (after line 116) | `pnpm vitest run packages/cli/src/autonomous/scan.test.ts` | "daytime and not away: off, no tracker call, no lock, one off event"; "daytime, away until in the past: runBack runs once and the scan is off" | yes |
| 5 | `isAway` dropped from the work rule | `scan.ts:81` | `pnpm vitest run packages/cli/src/autonomous/scan.test.ts` | "daytime, away with no until: claims a ready ticket"; "daytime, away until in the future: works" | yes |
| 6 | `notes.json` comparison dropped | `scan.ts:138` (`notes[key] !== h` to `true`) | `pnpm vitest run packages/cli/src/autonomous/scan.test.ts` | "the same failing ticket twice: one comment; a changed reason set: a second" | yes |
| 7 | `status === "to do"` filter removed | `tracker-clickup.ts:59` (`listToDo`) | `pnpm vitest run packages/cli/src/autonomous/tracker-clickup.test.ts` | "keeps only to do tickets and maps every field"; "fetches no ticket that is not to do and reads the milestones once"; "finds a to do ticket on page 3 of a 250-task space"; "finds a to do ticket on page 3 through the real client's paging (100 per page, page cap)" | yes |
| 8 | `runRelease` clears another ticket's lock | `release.ts:44` (foreign-lock throw deleted) | `pnpm vitest run packages/cli/src/autonomous/release.test.ts` | "a lock for another ticket throws and keeps the lock" | yes |
| 9 | `runBack` deletes `away.json` | `switch.ts:25` (`writeAway` replaced by `rmSync` of `away.json`) | `pnpm vitest run packages/cli/src/autonomous/switch.test.ts` | "keeps the file with away false and endedAt, runs the report"; "writes a fresh file when none exists, and logs away-expired"; "sets since to now when no file exists"; "returns the 409 without throwing and still writes the file" | yes |
| 10 | `readEvents` ignores `fromMs` | `state.ts:96` (`ms >= fromMs &&` removed) | `pnpm vitest run packages/cli/src/autonomous/state.test.ts` | "splits days and reads in order with bounds, skipping garbage" | yes |

Note on 10: the report test the plan names ("covers only the time since the previous report") does not fail under this mutation. That is by design: since the review fixes, `runReport` reads 30 days back for away context and `buildReport` cuts the period itself. The `readEvents` bound is pinned by the state test above. An extra check pins the report-level cut: with `report.ts:39` changed to `const events = allEvents;`, `report.test.ts` fails "covers only the time since the previous report" (restored: yes). No source change and no new test were needed.

Result: 10/10 mutations caught.

Full suites: `pnpm vitest run packages/cli scripts/conductor scripts/nexus-api`: 157 test files, 2123 tests passed. Three of four runs were green. The first run had 1 failed test in 1 file under full parallel load. That run's output was cut before the test name, and the failure did not come back in three more runs.
