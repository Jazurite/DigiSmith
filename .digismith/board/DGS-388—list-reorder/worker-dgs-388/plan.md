# Plan: DGS-388, `dg clickup move-list` reorders a list inside its own folder

Written 2026-10-11 UTC+7 by worker dgs-388. Spec: ticket `14zcebrvddu` plus Jack's confirmation (position only, no category).

## The change
Two bodies for the same call `PUT /hierarchy/v2/subcategory/{list}/position?v2=true&conflict_modal=true&return_conflict_on_cancel=true`:
- Folder change (the list moves into another folder): `{position, include_archived:false, category:<folder>}`. Unchanged.
- Reorder (`--folder` is the list's current folder, or `--folder` is left out): `{position, include_archived:false}`.

Rules in the command:
- Without `--folder` and without `--position`: refuse ("--position is required to reorder inside the list's own folder; or give --folder to move it").
- `--folder` given and equal to the list's current folder: `--position` is required (refuse without it). The default 0 stays only for a real folder change.
- `--folder` left out: reorder, `--position` required.
- Dry run and `--yes` both print which body (folder change or reorder) is sent, and the first-use help line says so.

## How the current folder is known
A new public-API read `ClickUpClient.getList(listId)`: `GET /list/{id}` (token auth, no Frontdoor session); the answer has `folder.id` (a folderless list has `folder.hidden: true`; I treat that as "no folder", so `--folder` is a real move and a missing `--folder` refuses).
- The read happens whenever the command needs the folder: `--folder` given, or `--folder` missing (to check nothing is wrong and to say it in the output). A dry run needs this read too (it uses the public token, not the Frontdoor session). If the read fails, the command stops with the error (fail closed, no guess).
- The command takes a second factory (`readerFactory`, default `createClient`), like other commands that mix both clients.
- Without `--folder` the read also tells the output "reorder inside folder <id>"; a folderless list refuses (a reorder inside the space is not part of this ticket).

## Error body
- `ClickUpClient.request` already adds ClickUp's body to the message (DGS-386).
- `FrontdoorClient.request` does not: I add the same lines (message gets `: <body>`), keeping the 401/403 -> `FrontdoorAuthError` path first. The command already prints `err.message`, so a 400 shows ClickUp's body.

## Files
- `packages/clickup-client/src/client.ts` (+ test in `client.test.ts`): `getList`.
- `packages/clickup-client/src/frontdoor.ts` (+ test): `moveList` takes `{position, folderId?}`, omits `category` when no folder; error body in `request`.
- `packages/clickup-client/src/types.ts`: `MoveListTarget.folderId` optional; a small `ClickUpListDetail` type.
- `packages/cli/src/clickup/move-list.ts` (+ `move-list.test.ts`): logic above, help text.
- No new allow rule (the move-list rule exists; the read is a GET through `dg`).

## Tests (first, see them fail)
1. client: `getList` GETs `/list/{id}` and returns the folder; Frontdoor `moveList` sends no `category` key without a folder; Frontdoor 400 message holds the body; 401 still FrontdoorAuthError.
2. CLI: dry run with `--folder` = current folder prints the reorder body (no `category`); dry run with another folder prints the folder-change body (existing assertions kept, now with a fake reader); no `--folder` + `--position` reorders; no `--folder` and no `--position` refuses; same folder and no `--position` refuses; `--yes` calls `moveList` with the right target; folderless list refuses; read failure refuses and sends nothing; dry run still never builds the Frontdoor client.

## Review and merge
Claude whole-branch review, fix verified findings, report.md/report.html, merge with hooks 01-03, push, as in the batch rules.

## First use (after merge and push)
1. `dg clickup get-lists --space 1301150000001271`: read the lists of B (`1301150000001908`) and D. Target order B.0..B.5 and D.0..D.4 by list name.
2. Work out the moves from the current order (B now B.4, B.1, B.2, B.0, B.3, B.5; D now D.4, D.1, D.2, D.3, D.0), in ascending target order (position 0 first, then 1, ...), skipping a list already in place.
3. For each: dry run, `--yes`, read the folder back with `get-lists`; stop at any error or surprise (a position that did not land, a list that left its folder).
4. Only lists of B and D. Never `PUT /hierarchy/v1/project/{space}`. Notes list and other folders untouched.
5. Close the ticket: `dg clickup update-task --task 14zcebrvddu --status done --start-date 2026-10-11 --due-date 2026-10-11`, read back (both dates `1791666000000`).

## Left out
- Reordering a folderless list inside the space (no capture; refused with a clear message).
- Reordering folders (that is `move-folder`, DGS-266).
