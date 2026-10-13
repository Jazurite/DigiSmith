# DGS-422 Conductor queryable state and the Maestro consult flow — Implementation Report

Ticket: DGS-422. Date: 2026-10-13. Branch dgs-422 (4 commits, rebased on 02ef86f), merge-ready, not merged, not pushed.

## Summary
Added `scripts/conductor/` (plain TypeScript, `node --experimental-strip-types`, no build, no `packages/cli` change): `state` (one answer to "what is going on"), `state-write` (the conductor writes its structured block), `consult` (local, or remote over plain ssh). All read-only except `state-write`, which touches only the text between its markers in the note.

## Built
- `state-block.ts`: markers `<!-- digismith:conductor-state v1 -->` ... `<!-- /digismith:conductor-state -->`; parser and renderer for the template's line formats (DGS-427 names); `writeStateBlock(notePath, body, marker)` with a parameterized marker (DGS-428's catch-up blocks, one per identity), atomic, mode kept, symlinks followed, bytes outside the markers untouched. Errors name the note line and the expected format.
- `state.ts`: `collectState` from the note, `git log origin/main`, herdr (server, tabs) and open cards (cross-check, stub until DGS-417 merges). A failing source gives a partial answer plus `sources` and `warnings`. Note path: `--note`, env `DIGISMITH_CONDUCTOR_NOTE`, `<depot>/conductors.json`, depot default.
- `runner.ts`: one Runner and a read-only guard (herdr status/agent/pane/tab reads, git log/rev-parse with only `--since=`/`--format=` flags, the single fixed ssh state form with charset-checked values).
- `consult.ts`, `cli.ts`: consult, text and JSON output, `--machine` for the live pane list.
- After the rebase the stubs are gone: `depotDir` from `scripts/depot-dir.ts`, `listCards` from `scripts/session-card.ts`, the seven sections from `renderCatchUp` (`scripts/catch-up.ts`), whose `CatchUp` type the state extends.
- Tests: 110 new (temp depot, fake note, fake runner, no real ssh). Full repo suite after the rebase and the review fixes: 117 files, 1697 tests pass with `FORCE_COLOR=1`. Typecheck: no error in `scripts/`.

## Design deviation
`herdr --remote` only opens the interactive UI (probed: "--remote can only be used with the default launch command"). The remote consult uses plain ssh (BatchMode, ConnectTimeout) running the same script on the Workbox; `herdr --machine <label> agent list` adds live panes. Settled as S9.

## Alignment
Matches the conductor's settled interfaces S1 to S12: 417's card API (`listCards(project, {scope:"open"})`), 427's `CatchUp` field types, 428's marker pair through `writeStateBlock(notePath, text, marker)`, 418's `## Session end` text left alone, code only under `scripts/`.

## Review
Claude whole-branch review (subagent). Verified and fixed with tests: git guard let `git log --output=<file>` through (now only `--since=`/`--format=`; herdr status args checked); a symlinked note was replaced by a regular file; impossible dates (31 Feb) were accepted; `Updated:` was stored unnormalized and `1.5x speed` lost its number in Next. Not bugs: no shell injection over ssh, no change outside the markers.

## First use
My part, run locally on 2026-10-13 ~13:53 UTC+7 with the `conductors.json` entry pointing at the existing note (read-only; no `state-write` on the real note): `state --project DigiSmith` returned Done (DGS-427, DGS-417, DGS-404 with report links), Server `running`, 9 open tabs, and a warning that the note has no state block yet (the conductor adds it). Running, Waiting, Decided, Parked, Next say `none` for the same reason.

The Maestro's part: commands in `probe.md` (conductors.json entry, conductor's state-write, local consult, one remote consult over ssh). If ssh is not allowed from the Desktop session the remote half is parked with the reason.

## Left out
ClickUp reads, the `dg` wrapper, moving the note into the depot (DGS-424), any allow rule (read-only commands; Jack adds one if wanted).
