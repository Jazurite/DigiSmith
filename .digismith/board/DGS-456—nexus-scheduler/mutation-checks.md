# DGS-456 mutation checks

Each mutation was applied alone to `scripts/nexus-api/src/scheduler/`, run with `pnpm vitest run scripts/nexus-api`, then restored from a copy (`git diff --stat` empty after each).

| # | Mutation | File | Change | Failing tests (exact) |
|---|----------|------|--------|-----------------------|
| 1a | Window end bound (inWindow) | clock.ts | `nowMs < s[0].windowEndMs` became `<=` | clock.test.ts: `inWindow > handles a window across midnight`; `inWindow > includes start and excludes end` |
| 1b | Window end bound (slots) | clock.ts | slot loop `atMs < windowEndMs` became `<=` | clock.test.ts: `nextRunAt > crosses a month change`; `slotsOfNight > hourly slots end with the last start before 06:00` |
| 2 | Overlap check | engine.ts | `isBusy` always returns false | engine.test.ts: `overlap > refuses a second run of the same job`; `overlap > runs two jobs due together one after the other, lower order first`; `scheduled slots > logs a slot reached while the job still runs as skipped busy`. routes.test.ts: `POST /jobs/<name>/run > 409 already_running while the job runs`; `the token never leaves the server > appears in no log line and no response body or header` |
| 3 | Token compare | guard.ts | `if (!tokenMatches(...)) return forbidden` became `if (false) ...` | guard.test.ts: `checkRunNow > 403 on missing token`; `403 on wrong token`; `does not throw on different-length tokens`; `never echoes the token or input in messages, and logs nothing`; `refuses a cross-site form post with no token`. routes.test.ts: `POST /jobs/<name>/run > a wrong token gets 403 without the body being read`; `a wrong token gives the guard status`; `no token gives the guard status`; `the real entry point on a throwaway server > starts the engine, runs selftest from a separate process with the token file, and stops cleanly` |
| 4 | Comment dedupe | notify.ts | the one-per-hour `return` replaced with `if (false) return` | notify.test.ts: `createClickupNotifier > dedupes per job per hour`; `dedupes the unclean start on its own key` |
| 5 | Clean-stop mark | engine.ts | `state.cleanStop = true` on stop became `false` | engine.test.ts: `containment > serializes state writes so no write is lost`; `interrupted runs > logs a running child interrupted at stop and writes the clean-stop mark`; `interrupted runs > logs the inFlight run interrupted at start after an unclean stop`. routes.test.ts: `the real entry point on a throwaway server > starts the engine, runs selftest from a separate process with the token file, and stops cleanly` |

All five mutations were caught; no test had to be added.

Whole suite after restore: `pnpm vitest run scripts/nexus-api` = 29 files passed, 372 tests passed (372).
