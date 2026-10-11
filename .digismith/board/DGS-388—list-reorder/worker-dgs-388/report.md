# DGS-388 report: `dg clickup move-list` reorders a list inside its own folder

Worker `dgs-388`, 2026-10-11 (UTC+7). Branch `dgs-388`.

## Built
- `ClickUpClient.getList` (`GET /list/{id}`) gives the list's current folder (`folder.hidden` true = folderless).
- `FrontdoorClient.moveList` leaves out `category` when no folder is given: the position-only body of the web app's reorder. `FrontdoorClient.request` adds ClickUp's error body to the message, like `ClickUpClient`.
- `move-list` reads the list first (dry run too). `--folder` equal to the current folder, or left out, is a reorder and needs `--position`; another folder is the old folder change (position default 0). A folderless list without `--folder`, and a failed read, refuse. Dry run and `--yes` say which of the two it is.
- Tests: client (`getList`, no category, error body), command (both bodies, refusals, failed read, 400 body). Whole repo passes with `FORCE_COLOR=1`; CLI build clean.

## Not built
- Reordering a folderless list inside the space; reordering folders (`move-folder`).

## Review
Claude whole-branch review: no findings.

## First use
Sort folders B and D into B.0 to B.5 and D.0 to D.4, then close DGS-388. See the maestro report.
