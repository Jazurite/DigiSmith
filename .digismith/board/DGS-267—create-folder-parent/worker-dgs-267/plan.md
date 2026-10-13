# DGS-267 plan: create-folder --parent-folder

Ticket: DGS-267 (ClickUp 14zcebrvcu2). Branch `dgs-267-create-folder-parent`.

## Route: create, then move
The public API v2 create-folder has no parent field and no capture exists. So:
1. `POST /space/1301150000001271/folder {name}` (existing client `createFolder`): a top-level folder.
2. `PUT /folder/<new id>/position {parent_folder_id}` (existing client `moveFolder`, same method as move-folder).
3. With `--yes`, read the result back with `getFolder(<new id>)` and print its `parent_folder`.

## Flags
- `--name <text>` (required, as today).
- `--parent-folder <id>` (new, digits only): the folder to put the new one into (Clans = 1301150000001850).
- `--yes` (new): only meaningful with `--parent-folder`.
- Without `--parent-folder` nothing changes: the folder is created at once, JSON printed, as today. Old tests stay green.
- With `--parent-folder`, the command is a dry run unless `--yes` (like move-folder). Reason: two writes, one half-done risk.
- `--yes` without `--parent-folder` is an error ("--yes needs --parent-folder"), so a flag never silently does nothing.

## Dry run (no client, no credentials)
Space id is the constant `DIGISMITH_SPACE_ID`; the new folder id is not known yet, so the second call shows a placeholder:
```
POST /space/1301150000001271/folder
{ "name": "<name>" }
PUT /folder/<new folder id>/position
{ "parent_folder_id": "<parent>" }
nothing sent; add --yes to send
```
Built with the existing `printCall`. The client factory is never called (test proves it).

## Failure handling
- Create fails: nothing was written; error, exit 1.
- Create ok, move fails: half-done state. Print on stderr: the new folder id and name, that it was created at the top level, `nothing was deleted`, and the exact finishing command `dg clickup move-folder --folder <id> --parent <parent> --yes`. Exit 1. Never delete the folder, never retry.
- Both ok, read-back confirms the parent: print `created folder <id> "<name>" inside folder <parent> (<parent name>)`; exit 0.
- Both ok, read-back shows ANOTHER parent: stderr `MISMATCH: folder <id> "<name>" is in folder <actual>, not <parent>`, plus the move-folder command; exit 1.
- Both ok, read-back has no parent or fails: print `created folder <id> "<name>" and sent the move into folder <parent>; parent not confirmed by the read-back` (or `read-back failed: <msg>`), and "check it with dg clickup get-lists (parent_folder)"; exit 0. Never the word "inside" without confirmation.
- Create answers no id: stop before the move; error `folder "<name>" was created but the response has no id: check dg clickup get-lists`; exit 1.
- Empty or whitespace `--name` on the `--parent-folder` path: refused before the dry run (`--name needs a non-empty name`). The old path (no `--parent-folder`) is left untouched and has the same gap.
- Errors go through the existing token-masking path of the client (DGS-88 lands first); no header is ever printed.

## Tests (mocks only, vitest)
Existing 2 tests stay. New, per mode, written failing first:
1. no `--parent-folder`: unchanged behavior (covered by the 2 existing tests).
2. dry run builds no client: factory is a spy that throws; prints both calls; nothing sent.
3. dry run output has the POST, the PUT with placeholder, and the "nothing sent" line.
4. `--yes` create ok + move fail: exit 1; stderr has the id and the exact move-folder command; `getFolder` not called; no delete.
5. `--yes` both ok: createFolder, then moveFolder(id, {parentFolderId}), then getFolder; prints the parent.
6. `--yes` both ok, read-back fails: exit 0, message says so.
7. validation: non-digit `--parent-folder`; `--yes` without `--parent-folder`; create fails (no move call).
Per-describe counts reported against base (base: 1 describe, 2 tests).

## Wiring
The command takes two factories: the existing space factory (no-parent path) and a client factory (parent path; `createClient`). The parent path uses `client.createFolder(DIGISMITH_SPACE_ID, name)`, so one client does all three calls.

## Files touched
- `packages/cli/src/clickup/create-folder.ts` (flags, flow)
- `packages/cli/src/clickup/create-folder.test.ts`
- Reused, not edited: client `createFolder`, `moveFolder`, `getFolder`; `printCall`; `DIGISMITH_SPACE_ID`.
- No change to `index.ts` (command already registered).
- No change to `.claude/settings.json`. **No allow rule proposed** (the conductor decides).

## Open point for the conductor
Does the dry-run default for `--parent-folder` fit? The alternative (create at once like today) is simpler but sends two writes with no preview.
First use after merge: dry run only, `--name "X: Test" --parent-folder 1301150000001850`; a real create needs Jack.
