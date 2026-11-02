# DGS-683 Castle: conductors in their own herdr session — Implementation Report

Ticket: DGS-683. Branch DGS-683__suite, head 3ca95ee4. Part 2 (another Builder) was already on main; part 5 (a second Builder) is merged into this branch. Read "Suite" in spec.md and plan.md as "Castle".

## What changed
- **Registry (part 1):** `packages/cli/src/conductor-registry/registry.ts` with per-entry tolerant reads (`session`, `workspace`, `floor`, `kind`, `ticket`, `under`, `status`); `scripts/conductor/registry.ts` re-exports it. State, refresh and flux read a conductor's own session; flux takes `--session`.
- **Autonomous (parts 1, 6):** `autonomous/conductor.ts` reads the factory conductor from the registry and prompts it in its session. `scan.ts` claims a driver record named after the factory conductor; `release.ts` releases it. A re-claim by the same conductor is accepted.
- **Run records and Oculus (part 3):** a run stores its herdr session; Oculus live view lists both sessions in parallel and marks `castle: ok|unavailable`. `scripts/nexus-shared/oculus.ts` changed (live view `session` and `castle`).
- **Boot files (part 4):** `scripts/herdr/` Castle daemon script and plist, bootstrap script (bash 3.2, `DRY_RUN`, `RELAUNCH_SLEEP`), `conductor-watch`, runbook, fake herdr.
- **Ticket conductor (part 5):** `dg conductor start-ticket|close|handover|sweep`, driver records, `driverRefusal` in `dg run start`. See report-part5.md.
- **Rename:** Suite became Castle everywhere (LaunchDaemon `com.jazurite.herdr-castle`).

## Protected paths touched (`packages/cli/src/autonomous/`)
`conductor.ts`, `conductor.test.ts`, `scan.ts`, `scan.test.ts`, `release.ts`, `release.test.ts`, `types.ts` (new event `driver-release-failed`), `watchdog.test.ts`, `index.ts` (one line: release gets `conductorsJson`).

## Tests
Whole suite at 3ca95ee4: 303 files (300 pass, 3 fail), 5112 tests (5109 pass, 3 fail). The 3 failures also fail on origin/main ee9549d6 (guardrails scan_every_minutes, autonomous index busy hand builder, run index 7-day list). Two of them come from the night 1/1/1 limits in config.yml.

## Review
Per-task reviews (r1, r2), whole-branch ticket-final r1 NOT READY (7 findings, all fixed), r2 all addressed plus F8 and F9 (fixed, checked by the conductor). See findings.md.

## Notes for the conductor (after the merge)
- Part 3 changes `scripts/nexus-shared/oculus.ts`: run the nexus-api install and restart, and build-www.
- Rebuild the CLI (`pnpm --filter @digismith/cli build`) for `dg conductor`.
- Known limit: `defaultDeps` ignores `DIGISMITH_DEPOT_DIR`.
- Not done by the Builder: no install of herdr-ws, bootstrap, conductor-watch or the plist; the real Castle session was never started; no migration (part 7).

## First use
Dry-claim check, then the bootstrap in DRY_RUN, then `dg conductor start-ticket` on a throwaway ticket. Unverified against a real herdr (needs a real session).
