# Plan: DGS-382, `dg clickup restore-list` (Frontdoor)

## Change
`dg clickup restore-list --list <id> [--yes]` restores a deleted List from the ClickUp Trash, with its tasks.
Dry run unless `--yes`.

Call, confirmed from capture Raw_10_11_2026_11_48_47 entry [13] (read with `dg clickup frontdoor dump --match undo`, no headers):
`PUT /v1/subcategory/{list_id}/undo`, body `{"method": "delete"}`, answer `200 {}`.
The path has no `/hierarchy/v2` prefix (unlike move-list). I use it exactly as captured.

## Files
- `packages/clickup-client/src/frontdoor.ts`: `restoreList(listId): Promise<void>`, one `request("PUT", ...)`. Error body handling is already in `request`.
- `packages/clickup-client/src/frontdoor.test.ts`: client tests.
- `packages/cli/src/clickup/restore-list.ts` + `restore-list.test.ts`: `createRestoreListCommand(clientFactory = createFrontdoorClient)`, modelled on move-list. Only a Frontdoor client, no reader (nothing to read first).
- `packages/cli/src/clickup/index.ts`: register the command.
- Board: this plan, then `report.md` and `report.html`.

## Behaviour
- `--list` required, digits only, else error and exit 1 before any call.
- Dry run (default): builds no client (works without a session). Prints the call via `printCall("PUT", "/v1/subcategory/<id>/undo", {method:"delete"})` and "nothing sent; add --yes to send".
- `--yes`: `restoreList(list)`, then prints "restored list <id>; check with dg clickup get-lists (the list is back, task count)".
- A failure prints `clickup restore-list: <message>` (with ClickUp's error body) and exits 1. No session: factory error, exit 1.

## Tests (first, see them fail; mocks only)
Client: PUT path and body as captured; error body in the message of a 400.
Command: dry run prints call and sends nothing; dry run never builds the client; `--yes` calls `restoreList` with the id and the output mentions get-lists; `--list` abc / empty rejected before a call; failed send prints message, exit 1; `--yes` without session exits 1; error body shown.

## First use: NONE (Jack's rule)
No real restore, `--yes` only on a list Jack names, by Jack's own command. No dry run on a real deleted list id. One dry run with the made-up id `--list 1` to see the output. DGS-382 is NOT set `done`; I report "merged, pushed, first use pending" and stop.

## Allow rule
None for `restore-list`: a restore changes ClickUp state, so every real use prompts for Jack.

## Left out
Folder (`/v1/category/{id}/undo`) and task undo: likely exist, but no capture. A capture is needed before adding them; I say so in the report. No delete command touched or run.

## Steps after approval
Branch `dgs-382` in `.worktrees/dgs-382` from origin/main (f8591bd, includes hook 03); TDD; pnpm only; Claude whole-branch review, fix verified findings; report.md/report.html with own pins; rebase, `FORCE_COLOR=1 pnpm test`, CLI build; fast-forward main, hooks 01-03, rebuild, check `--help` lists the command, push.
