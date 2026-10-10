# Plan: DGS-136, custom fields in dg clickup (checkpoint 1)

Worker `dgs-136`. Spec: ticket `14zcebrunta`. Pattern: DGS-135 (`update-field.ts`, `field-write.ts`).

## Commands
- `dg clickup list-fields --list <id>` (read only). Prints one block per field: `id  name  type`, and for drop_down fields the options as `name (option id)`. Calls `client.getListFields`. `--json` prints the raw array instead.
- `--field "<name or id>=<value>"` on `create-task` and `update-task`. Repeatable (`array: true`, `requiresArg`). Split at the FIRST `=` (field names have no `=`, values may). Empty name or value is an error.

## Resolution (new `packages/cli/src/clickup/field-set.ts`, pure functions + one async helper)
1. `parseFieldArg(input)` -> `{ key, value }`.
2. `resolveField(fields, key)`: a field whose id equals `key` wins. Else match by name, case-insensitive.
   - 0 hits: error `unknown field "X"; fields: A, B, C`.
   - more than 1 hit: error `field name "Bucket" matches 2 fields on this list; use the field id: <id> (drop_down), <id> (currency)`.
3. `resolveValue(field, raw)`:
   - `drop_down`: option id match first, then option name (case-insensitive). 0 hits: error `unknown option "Z" for field "ClickUp API Type"; options: Frontdoor, Public`. More than 1 option with the same name: error asking for the option id. Sends the option id (uuid) to `setCustomField`.
   - `checkbox`: `true` / `false` only; else error.
   - `currency`: a finite number; else error. Sent as a number.
   - `labels`, `automatic_progress`, any other type: error `field type X is not supported by --field` (never a silent raw value).
4. `applyFields(client, listId, taskId|null, args)`: `getListFields(listId)` once, resolve ALL args first (so one bad arg stops everything before any write), then `setCustomField` per field.

## Where the list comes from
- `create-task`: the `--list` flag. Order: resolve fields (read) -> `createTask` -> `setCustomField` per field. A bad `--field` fails before the task exists.
- `update-task`: the task's list. The client has no `getTask`; `get-task` uses `client.get<ClickUpTask>("/task/<id>")`, so I do the same (`task.list.id`). Order: get task (read) -> resolve fields -> `updateTask` (only if other flags given) -> `setCustomField` per field. `update-task` with only `--field` skips the PUT; today the PUT with an empty body is not guarded, so I keep that rule: PUT only when a task flag is set.
- Output: the existing JSON of the task. After the field writes, I re-fetch the task (`GET /task/<id>`) so the printed JSON shows the new field values.

## Dry-run habit
Existing `update-task` and `create-task` have NO dry run: they write at once. `--field` follows that habit (no `--yes`, no dry run). The safety is validation first: every field and option resolves before the first write, and an error writes nothing. `list-fields` is the dry look. (DGS-135 `update-field` has `--yes` because it edits the field definition, a workspace-wide change; that is a different risk.) Say so if you want `--field` to get a dry run; it would be a `--dry-run` flag printing the resolved `POST` calls.

## Tests (vitest, TDD, fakes, no network)
`field-set.test.ts`: parse (first `=`, empty parts); id wins over name; name case-insensitive; unknown field lists names; DUPLICATE NAME ("Bucket" twice, error asks for the id, id then works); drop-down by name, by option id; unknown option lists options; duplicate option name; checkbox and currency good and bad; unsupported type error; all args resolve before any write (second bad arg => `setCustomField` never called).
`list-fields.test.ts`: text output with options, `--json`, client error => exit 1.
`create-task.test.ts` / `update-task.test.ts`: `--field` calls order (create then set), update with only `--field` makes no PUT, bad field => no write and exit 1, repeatable.
Run: `pnpm --filter @digismith/cli test` (`FORCE_COLOR=1` for the known `index.e2e` colour test, not mine).

## Files
New: `list-fields.ts`, `field-set.ts`, two test files. Edit: `index.ts` (register), `create-task.ts`, `update-task.ts` (+ tests), README/help text if the CLI docs list commands. Branch `dgs-136` in `.worktrees/dgs-136` from origin/main, after "approved: checkpoint 1". pnpm only.

## First use (after Jack's yes at checkpoint 2)
`dg clickup update-task --task 14zcebrvcu1 --field "ClickUp API Type=Frontdoor"` (DGS-266), same for `14zcebrvcu2` (DGS-267), and DGS-320 = Public (find its id on the D.3 list with `list-tasks`). Read each back with `get-task`. Checkpoint 2 also shows a read-only `list-fields` on D.3.

## Reports
At the end: `report.md` and `report.html` in this folder (history hook picks DGS-136's own report).

## Questions for Jack
1. Is "no dry run for `--field`" (follow update-task) right?
2. Is the unsupported-type list (labels, automatic_progress) fine for a first version?
