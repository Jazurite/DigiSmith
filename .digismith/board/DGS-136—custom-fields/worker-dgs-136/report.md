# Report: DGS-136, custom fields in dg clickup

Worker `dgs-136`. Branch `dgs-136` in `.worktrees/dgs-136`, 2 commits on origin/main. Not pushed, not merged.

## Done
- `dg clickup list-fields --list <id> [--json]`: id, name, type, drop-down options.
- `--field "<name or id>=<value>"` (repeatable) on `create-task` and `update-task`. Field id wins over name; names are case-insensitive. A duplicate name is an error that asks for the field id. Unknown field or option is an error that lists the valid names.
- Types: drop_down (option name or id, sends the option id), text, short_text, number, currency (finite number), checkbox (true/false). labels and automatic_progress are an error.
- All fields resolve before the first write, so a bad one writes nothing. No dry run, same as update-task. `update-task` with only `--field` skips the empty PUT. The printed task is re-fetched after the field writes.
- A failed field write names the field and shows ClickUp's error body (second commit).
- Tests: `FORCE_COLOR=1 pnpm test` passes (see below). New: `field-set.test.ts` (17), `list-fields.test.ts` (3), `--field` cases in the create and update test files.

## First use (Jack's yes at checkpoint 2)
ClickUp API Type set with `update-task --field` from the branch build, read back with `get-task`:
- DGS-266 (`14zcebrvcu1`) = Frontdoor
- DGS-267 (`14zcebrvcu2`) = Frontdoor
- DGS-320 (`14zcebrvcyf`) = Public

## Open point
The first run of the three writes returned `404` on each task and wrote nothing. I added the error-body detail and ran again: DGS-266 worked at once, DGS-267 and DGS-320 returned 404 on one more run, then both worked on the next. A traced run showed no failing call. I did not find the cause. It looks transient on the ClickUp side; the 404 text carries no field detail. Worth a look if it comes back.

## Merge order needs
Hooks 01-03 (history picks this `report.html`), then `pnpm --filter @digismith/cli build` in the main checkout. Known: `index.e2e.test.ts` needs `FORCE_COLOR=1`.
