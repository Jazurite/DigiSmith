# DGS-599 report: Oculus, the live dashboard on its own subdomain

Ticket DGS-599 (J.5 Oculus, epic DGS-597). Branch `DGS-599__dashboard-live`, order oc-01 (Sign-off: Auto).

## What changed
- The side bar text starts at the 24 px page gutter on every width, including Jack's view: Chrome at 110% zoom, about 1860 px wide. Nothing clipped. The cause was an 18 px inset (14 px on the phone row). `sidebar-probe.md` has the repro. WebKit was dropped by the Maestro's ruling (2026-10-24). Spec sections 8 and 10 say so.
- Nightwatch is renamed to Oculus on the dashboard surface:
  - CLI `dg oculus view` (`packages/cli/src/oculus/`)
  - API `/api/v1/oculus/*`
  - shared schema `scripts/nexus-shared/oculus.ts`
  - web components `Oc*`, tokens `--oc-*`, layout `oculus`.

  `dg nightwatch` is gone, and no caller is left. The engine names (`nightwatch-watchdog`, the `nightwatch-*/v1` schema ids, the config key) stay, as DGS-604 owns them.
- Oculus is its own static site at `/`, with the pages `/`, `/attention/`, `/runs/`, `/run/` and `/plan/`. `NEXUS_SITE=life|oculus` gives two builds (`.output/`, `.output-oculus/`). `build-www.sh` publishes `$DEPOT/nexus/oculus.d/<stamp>` and points the `oculus` symlink at it.
- Caddy repo files only: the `oculus.pazurite.com` block, the `(nexus_api)` and `(static_site)` snippets, and `DIGISMITH_OCULUS_WWW` with an `oculus.d/empty` placeholder in `caddy-run.sh`, which fails closed. The live Caddy, the DNS and the depot copy are not touched.
- `dg oculus view live`: one fixed read-only herdr call (`--session default agent list`, 3 s timeout). It returns only allowed, capped fields. The role comes from DGS-598's `roleOf`. The project comes from the folder under `~/Workspace`. A run joins by pane, or by Claude session id. A pane match whose session differs is skipped, and only runs from the last 7 days count.
- `GET /api/v1/oculus/live` always answers 200. When herdr is down, it serves the last good list from `$DEPOT/nexus/state/oculus-live-last.json` (folder 700, file 600, never under a web root), marked disconnected with its time.
- The Oculus index page:
  - The agents table, with status, filters (workspace, role, project, status) and the done agents last.
  - The attention summary.
  - The "Disconnected from herdr, as of HH:MM" banner.
  - Stale data is shown as stale and is never green.
  - The top-bar agents item and the nav's blocked count, from a 5 s live poll.
- The Runs page has role and project filters. Maestro and conductor rows show "-" instead of a health dot.

## Tests
- Clean full web gate at `320514d` (21:59 to 22:38 UTC+7, load 4.5 to 5.6, no other run):
  - root Vitest 4199 of 4199 (270 files); `test-install` rerun 19 of 19; CLI 2219 of 2219; web Vitest 353 of 353
  - Nuxt build (both sites) and Storybook OK
  - Playwright (e2e, accessibility including stories-axe, visual, perf): 759 passed, 194 skipped, 0 failed, 1 flaky. The flaky test is the Life calendar's phone INP: 208 ms against a 200 ms budget, passed on retry. The branch does not touch it.
- After the ticket-review fix `346518a`: CLI oculus and strip-types smoke tests 81 of 81, and the CLI `tsc` is clean.
- `nuxt typecheck` shows 8 errors, all in `nexus-api/src/scheduler/{clock,guard,runlog}.ts` from main. This branch does not change those files.
- No test calls the real herdr or writes to the real depot. The server tests pass a temp depot.

## Review
Nine tasks, each reviewed:
- Tasks 3 and 8 had one Important finding each, both fixed and closed by a clean scoped r2.
- Every other finding was Minor. Six are parked as follow-ups; one (the grid load flake) was rejected with a reason.
- The whole-branch review was ready to merge with 1 Minor finding (the live view's day window), fixed.
- See `findings.md`. The SHAs in the per-task rows are from before the two rebases onto main (DGS-598 and DGS-592).

## Follow-ups
- Task 6 F5: a real `realHerdr` test with a fake binary.
- Task 7 F4: skip the snapshot write when the agent list is unchanged.
- Task 8 F3 and F4: an unknown URL filter value, and the duplicate empty text.
- Task 9 F1: one `unflagged` helper.
- Taste points for Jack:
  - On the phone index the filter boxes wrap unevenly.
  - Maestro and conductor runs show "-" as their Key, where the run id might be clearer.

## After the merge (the conductor and the Maestro, in the spec's order)
1. Install the repo Caddyfile and `caddy-run.sh` into the depot, add the DNS record for `oculus.pazurite.com`, and restart the Caddy LaunchAgent. `task-5` in the ledger has the exact steps.
2. Build the CLI dist (`pnpm --filter @digismith/cli build`) in the main checkout. Until then `view live` fails, and the page reads "Disconnected from herdr. No agent list yet." That is not a herdr fault.
3. Restart the Nexus API (port 4300).
4. Run `build-www.sh`.

The Builder did none of these.
