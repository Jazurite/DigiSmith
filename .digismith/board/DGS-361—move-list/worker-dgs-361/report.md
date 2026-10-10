# DGS-361 report: dg clickup move-list on Frontdoor

Status: built on branch dgs-361. No ClickUp write was made. First use is DGS-365 (a separate worker, after the merge).

- The public API documents no List move (docs, llms.txt and the open feedback request checked), so the call is Jack's capture Raw_10_11_2026_00_54_03.folder, entry [188]: `PUT /hierarchy/v2/subcategory/{list}/position?v2=true&conflict_modal=true&return_conflict_on_cancel=true`, body `{position, include_archived:false, category}`, answer `{}`. The follow-up `PUT /hierarchy/v1/project/{space}` is not sent.
- `FrontdoorClient.moveList(listId, {folderId, position})`; type `MoveListTarget`.
- `dg clickup move-list --list <id> --folder <id> [--position n] [--yes]`: dry run unless `--yes`; the dry run builds no client; ids must be digits; position a whole number, 0 or more (default 0). No own-folder check (it would need a read with the token).
- Allow rule `Bash(dg clickup move-list:*)`: the `:*` also lets `--yes` through unprompted, as for move-folder.
- Tests: 1 client test and command tests; full run passes with `FORCE_COLOR=1`; CLI build clean.
- Dry run for C.3 into I at position 1 printed the PUT with `{"position":1,"include_archived":false,"category":"1301150000002921"}`; nothing sent.
