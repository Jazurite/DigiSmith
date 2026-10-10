# DGS-135 report: `dg clickup update-field`

Worker `dgs-135`, 2026-10-10 (UTC+7). Branch `dgs-135` in `.worktrees/dgs-135`, commit `a5cc8b5`. Not pushed, not merged.

## Built
- `FrontdoorClient.getField` and `updateField` (GET and PUT `/customFields/v2/field/{id}`), types `FrontdoorField` and a corrected `FrontdoorFieldPutBody`.
- `dg clickup update-field --field <id> [--name X] [--option "Old=New"]... [--yes]`: dropdown only, dry run unless `--yes`, diff plus call in the dry run, no header printed.
- Tests: 20 new; whole repo 178 passed (27 files, pnpm). CLI build clean.
- Not built (captured, left for a follow-up): add option, remove option. `--field` on `update-task` stays in DGS-136.

## First use (Jack's yes at checkpoint 2, ~18:2x UTC+7)
Ran with `--yes` from the worktree build: field `bbc7e23a-bd40-423d-926b-3280ae39928f` renamed to **ClickUp API Type**; options renamed to **Frontdoor** (b31369f7..., order 0) and **Public** (518a0820..., order 1). ClickUp answered 200; ids, colours and order unchanged.

Read back (`dg clickup list-tasks` on the D.3 list): DGS-133 = Frontdoor, DGS-218 = Public, DGS-135 = Frontdoor, field name "ClickUp API Type". Values on existing tickets stayed.

## Open
- Merge needs Jack's yes; the maestro's merge order carries hooks 01-03.
- Setting the value on DGS-266 and DGS-267 waits for DGS-136.
