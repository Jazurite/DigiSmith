# DGS-719 spec and plan: one main-checkout constant for the Nexus API (one page)

Ticket DGS-719 (Urgent, Mode Manual, hand-built on Jack's word 2026-11-10). Order: `order-oc-mainpath-dgs-719.md`. Read the ticket description for the outage.

## Spec
- One module `scripts/nexus-api/src/main-checkout.ts`: `MAIN_CHECKOUT = process.env.DIGISMITH_MAIN_CHECKOUT ?? join(homedir(), 'Workspace', 'Engineering', 'Jazurite', 'DigiSmith')` and `MAIN_CLI = join(MAIN_CHECKOUT, 'packages', 'cli', 'dist', 'index.js')`. The env override is read at import time (the API process env). `scheduler/registry.ts`, `oculus-reader.ts` and `nightwatch-reader.ts` import it. No other copy in `scripts/nexus-api/`.
- A move must not break it silently again: `checkMainCheckout()` returns `{ ok, path, cli }`; the API start (`server.ts`) logs ONE error line when `MAIN_CLI` does not exist: `main checkout CLI missing: <path> (set DIGISMITH_MAIN_CHECKOUT)`; the jobs list route (`GET /api/v1/jobs`) carries the same line in its payload as `warning`. A missing CLI never stops the API.
- Other old-path references (grep `Workspace/Jazurite/DigiSmith` in code, not board docs, not test fixtures of other tools): only the ones the API, the scan or the Maestro catch-up use:
  1. `packages/cli/src/autonomous/observers-real.ts:93` `MAIN_CHECKOUT` (the scan's own default; PROTECTED path `autonomous/`) and the help text `packages/cli/src/autonomous/index.ts:409` ("default ~/Workspace/Jazurite/DigiSmith").
  2. `scripts/herdr/herdr-bootstrap.sh:26` `DG_DIR` default (the conductor boot).
  3. `scripts/conductor/consult.ts:68` `DEFAULT_REMOTE_REPO` (the Maestro's catch-up over SSH) and its tests (`consult.test.ts`, `runner.test.ts` fixtures that pin the default).
  Not changed (named only): `oculus/live.test.ts` and `oculus-contract.test.ts` fixtures (generic HOME-based paths), `kimi-k3` fixtures (a Windows path, unrelated), board docs.
- Protected: `scripts/nexus-api/src/scheduler/` and `packages/cli/src/autonomous/`. The merge needs the Maestro's approval.

## Plan (test first)
1. `main-checkout.test.ts`: default path (HOME-based, `Engineering`), env override, `checkMainCheckout` on a missing and an existing CLI (temp dir). Then the module.
2. Switch `registry.ts`, `oculus-reader.ts`, `nightwatch-reader.ts` to the module; update `registry.test.ts` (dist path line 94, `--repo` line 183), `oculus-reader.test.ts:81`, `nightwatch-reader.test.ts:81` to the new default (use the module's value, not a second literal).
3. Missing-CLI line: test in `server` start and in the jobs route payload; then the code.
4. Items 1-3 of "Other references": change the default, update the tests that pin it; `observers-real.ts` should reuse nothing from `scripts/` (different package): its own constant with the same env var name `DIGISMITH_MAIN_CHECKOUT`.
5. Whole `scripts/nexus-api` tests, `packages/cli/src/autonomous` tests, `scripts/conductor` tests and `scripts/herdr` tests (forks pool of 2, load < 4). Known base failure: `autonomous/guardrails.test.ts` "sets scan_every_minutes to 15" (config pins reviewer 1, main now has 2).

## After the merge (conductor, with the Maestro's approval first)
CLI dist at the new path; `sh scripts/nexus-api/install.sh` from the NEW checkout; ONE kickstart of the nexus-api; first use: `GET /api/v1/jobs` shows autonomous-scan, nightwatch-watchdog, schedule-release, oculus-tokens ok on their next slots (the report on its 06:00); `/api/v1/oculus/{overview,runs,attention}` answer 200; `dg autonomous status`. Report the DGS-699 lock state; do not release it.
