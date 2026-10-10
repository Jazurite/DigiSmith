# DGS-266 report: dg clickup move-folder on the public API

Status: built and committed on branch dgs-266 (ad03b6a), not pushed, not merged. First use done after Jack's yes at checkpoint 2: G: TBD moved into Clans on the first try, get-lists read back parent_folder = 1301150000001850.

- `ClickUpClient.moveFolder(folderId, {parentFolderId} | {spaceId}, position?)`: `PUT /folder/{id}/position`. Type `MoveFolderTarget` in `types.ts`.
- `dg clickup move-folder --folder <id> (--parent <id> | --space <id>) [--position n] [--yes]`: dry run unless `--yes`; dry run builds no client; both flags together, neither flag, same folder and parent, bad ids and bad position are refused; `--parent none` hints at `--space`.
- Removed: Frontdoor `moveFolder`, its test and its body type (nothing else used them). Allow rule kept.
- Tests: 2 client tests, 15 command tests; full run 1031 passed (`FORCE_COLOR=1`); CLI build clean.
- Dry run for G: TBD into Clans printed `PUT /folder/1301150000002844/position` with `{"parent_folder_id": "1301150000001850"}`; nothing sent. Then run with `--yes`: moved.
