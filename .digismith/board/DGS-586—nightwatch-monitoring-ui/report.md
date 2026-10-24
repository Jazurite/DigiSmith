# DGS-586 Nightwatch monitoring UI: report

Date: 2026-10-24 (UTC+7). Branch `DGS-586__nightwatch-ui`, 37 commits on main `3c41271`. Full detail: `report.html`. Findings of every review: `findings.md`.

## What shipped

A read-only dashboard for the run record in the Nexus web app:

- `dg nightwatch view <overview|attention|runs|run|events|plan>` prints one JSON view.
- The Nexus API has GET-only routes under `/api/v1/nightwatch/`. They run the built CLI (`packages/cli/dist/index.js`), cache for 5 s and check the answer with zod schemas from `scripts/nexus-shared/nightwatch.ts`.
- Five static pages under `/nightwatch/` poll every 10 s (30 s after a failure, paused in a hidden tab).
- No login in v1 (DGS-458 adds one). Tokens, token burn and seat windows are out of scope.

## How Jack opens each screen

On the tailnet: `https://pazurite.com/nightwatch/` and the paths below. On the Workbox itself the site answers at `https://127.0.0.1:8443` with the Host header `pazurite.com` (for example `curl -k -H 'Host: pazurite.com' https://127.0.0.1:8443/nightwatch/`). The API is at `http://127.0.0.1:4300/api/v1/nightwatch/overview`.

| Screen | Path | Shows |
| --- | --- | --- |
| Operations | `/nightwatch/` | open workers, phase table (one claimed ticket at a time, window 7 days), scan facts, last events |
| Attention | `/nightwatch/attention` | open items that need Jack, with the resolve command as copy text; resolved items |
| Runs | `/nightwatch/runs` | all runs, filters for state, role, ticket and trigger |
| Run detail | `/nightwatch/run?id=<run-id>` | pipeline, budget, record, order, event tail |
| Plan | `/nightwatch/plan?ticket=<KEY>` | plan tasks, fix rounds, finding verdicts |

With no run yet, every screen shows its empty state. The next night scan, or `dg run start`, fills Operations and Runs.

## After the merge (the conductor runs these)

1. `pnpm --filter @digismith/cli build`
2. `scripts/nexus-api/install.sh`
3. `scripts/nexus-web/build-www.sh`

The API needs `packages/cli/dist` built. Without it the API answers 503 `reader_unavailable`.

## Checks

| Check | Result |
| --- | --- |
| root `pnpm vitest run` (before the last rebase) | 255 files, 3913 tests pass |
| web vitest | 29 files, 310 tests pass |
| `nuxt generate`, `build-storybook`, CLI build | pass |
| `nuxt typecheck` | 8 errors, all in `nexus-api/src/scheduler/*`, no diff against main |
| e2e, visual, axe (Nightwatch specs) | pass on Chromium 1243 |
| full a11y suite | ran once on the branch (397 passed); after the fix wave only the Nightwatch specs ran |
| lhci | not run, LCP and TBT budgets are unmeasured |

Chromium: the pinned build 1248 is not installed here. The gates ran on 1243 through an untracked local config (`scripts/nexus-web/playwright.local.config.ts`, left untracked on purpose). The new visual baselines come from 1243. If a diff shows up on a machine with 1248, regenerate them there.

## Decisions and deviations

- The shared schema checks ISO UTC timestamps. The Nexus status has four values: healthy, degraded, unknown, breaker-open. A missing job gives degraded and a job that never ran gives unknown, never a false green.
- An unknown path under the prefix answers 404; a known path with another method answers 405 with `Allow: GET`.
- Main added a `fixing` verdict; the plan view and the Plan page show it with an in-progress tone.
- The Warren notice (full MIT text) ships in the CSS (`--nw-notice`) and in `THIRD-PARTY-NOTICES.txt`.

## Follow-ups

- F12 (parked): `useEventTail` `first()` from `setGroup` never schedules the next poll. After a filter change, hide and show before it ends, the tail stops until the next visibility change. Rare and recoverable.
- Other readers of `events.jsonl` outside `nightwatch/views.ts` (`run/events.ts` `readEvents` and its callers) still cast raw lines without a shape check.
- `--role --json` takes `--json` as the value of `--role` (harmless).
- The event stream stories show raw `name=Edit ok=true` text. A taste call for Jack.
- lhci budgets for `/nightwatch/` are unmeasured.
- Visual baselines: regenerate on Chromium 1248 if they differ.
- Task 12 had no separate task review (the ticket review covered it).
