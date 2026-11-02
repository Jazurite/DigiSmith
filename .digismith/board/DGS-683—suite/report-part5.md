# DGS-683 Castle, part 5: the ticket conductor — Implementation Report

Ticket: DGS-683 (part 5 = tasks T17 to T21 of plan.md). Branch DGS-683__ticket-conductor, created from the head of DGS-683__suite (61e3dfa5). Read "Suite" in spec.md and plan.md as "Castle".

## What changed (packages/cli)
- **T17 `conductor/drivers.ts`:** one driver record per ticket, `<depot>/drivers/<KEY>.json`. `claimDriver` (wx, `DriverTaken`), `handoverDriver` (atomic rename, only from the named driver), `releaseDriver` (only the driver), `readDriver`. Ticket key `^[A-Z]+-\d+$`; the file shape and its ticket are checked on read.
- **T18 `conductor/start-ticket.ts`:** `dg conductor start-ticket`: checks starter (open entry in Castle) and the cap (2 open ticket conductors), claims the driver, writes the registry entry `Project/tc-<key>` and the brief, then three-plus herdr-ws calls in Castle: `tab create`, `pane run` (exports `HERDR_SCOPE`, `DIGISMITH_NAME`, `HERDR_WS` like the bootstrap), `agent start` (bootstrap flags, `--kind claude`), `agent prompt --wait`. Any failure rolls back: tab closed, driver released, entry removed (each step guarded, original error rethrown).
- **T19 `close.ts`, `sweep.ts`:** `close --self` (entry open, kind ticket, `HERDR_TAB_ID` set, name is the driver; release and remove first, tab close last), `handover`, `sweepTickets` (running or gone against live Castle agents).
- **T20 `conductor/index.ts`, `src/index.ts`, README:** the `dg conductor` command with injectable deps; `realLive` reads `herdr-ws --session Castle agent list` (strict, 3 s timeout).
- **T21 `run/index.ts`, `run/limit-check.ts`:** `dg run start` for builder or reviewer refuses when another conductor drives the ticket (`DGS-9 is driven by tc-dgs-9 (since ...): ask that conductor`); no driver file: unchanged.

## Tests
`pnpm exec vitest run --pool=forks --poolOptions.forks.minForks=1 --poolOptions.forks.maxForks=2 packages/cli/src/conductor packages/cli/src/conductor-registry packages/cli/src/run packages/cli/src/index.test.ts packages/cli/src/strip-types.smoke.test.ts`: 275 pass, 1 known failure (`dg run > list hides runs idle for more than 7 days`, fails on the base too). All tests use temp dirs and fake `exec`.

## Review
T17 r1, r2; T18 r1, r2; T19 r1; T20 r1; T21 r1; ticket-final r1 APPROVED (0 Critical, 0 Important). See findings-part5.md.

## Notes for the Maestro / conductor
- The registry module is at `packages/cli/src/conductor-registry/registry.ts` (the brief said `conductor/`); the new code imports it from there.
- The agent flags are a TS copy of `ensure_agent` in `scripts/herdr/herdr-bootstrap.sh` (part 4), pinned by a literal test. If the bootstrap flags change, change `conductorFlags` in `start-ticket.ts`.
- `ExecOut` (an `Exec` plus optional stdout) was added because the pane id comes from `tab create` stdout; `Exec` is only imported as a type from `autonomous/conductor.ts`.
- Parked: handover/release race between two processes (T17 F1); close release-then-remove partial failure (ticket F1). Both noted in findings-part5.md.
- README notes: `start-ticket` overwrites a stale entry; `handover` does not check `--to` is a registry conductor.
- `packages/clickup-client/dist` had to be built in the worktree for the strip-types smoke test (git-ignored, not committed).
- tokens-part5.json is the whole-ticket `dg tokens DGS-683 --json` snapshot at 23:10 UTC+7 (16:10Z).
- No protected path touched (`packages/cli/src/autonomous/` untouched). No install, no live herdr session, no ClickUp write, nothing pushed.

## First use
Not run. After the part 4 install and the herdr-ws deploy: `dg conductor start-ticket --ticket <KEY> --under <name>` from a Castle conductor on a throwaway ticket, then `dg conductor sweep` and `dg conductor close --self` inside the new tab. Unverified against a real herdr: the JSON shape of `tab create` (pane id read from the first `pane_id` key, same as herdr-ws's own finder).
