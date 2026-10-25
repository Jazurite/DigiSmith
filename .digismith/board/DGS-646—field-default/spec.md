# DGS-646: `dg clickup update-field --default`

## Why
The Mode field should default to Autonomous. ClickUp's UI sets a field default, the public API does not, and `dg` cannot. Jack set it once in the UI and captured the call. This ticket gives `dg` the same call.

## The capture (reads file, section 1)
Source: `.digismith/sessions/dgs-646/maestro-reads.md`, request [23].
- It is the call `update-field` already makes: `PUT /customFields/v2/field/{id}` on Frontdoor, with the FULL field as body (not a patch).
- The default is `default_value: { "value": "<option NAME>" }`. It is the name, not the option id. No default is `null`.
- The response echoes the field with `default_value`, so a read of the field shows it.

## Code facts (reads file, section 2)
- `buildFieldPutBody` (`packages/cli/src/clickup/field-write.ts`) already sends `default_value: field.default_value ?? null`. A rename or add-option today keeps an existing default. A test pins this.
- `default_value` is typed `unknown` in `FrontdoorField` and `FrontdoorFieldPutBody` (`packages/clickup-client/src/types.ts`). Narrow both to `{ value: string } | null`.

## Behavior
New flags on `dg clickup update-field`:
- `--default <option name or id>`: sets the default. Stored by NAME (the id is resolved to the name).
- `--clear-default`: sets `default_value` to `null`.
- The two flags exclude each other (error).
- Both count as a change for the "nothing to change" check.
- Dropdown fields only (the check update-field already has).
- Dry run unless `--yes`, as today. The dry run prints the diff and the PUT body.

Rules:
- Unknown option for `--default`: error that lists the options.
- `--default` equal to the current default: print `default already <name>`, send nothing, exit 0. Alone, this is not an error. Combined with other changes, the other changes still go and the default stays.
- Rename of the CURRENT default option (`--option "Autonomous=Auto"`): the default follows the new name. The diff shows it. Without `--default`/`--clear-default`.
- Remove of the CURRENT default option: refuse (error), unless the same call has `--default <other>` or `--clear-default`.
- `--yes`: after the PUT, read the field again with `getField`. If `default_value` is not what the body asked for, print both values and exit 1 (fail closed, same as `rename-status`).
- `get-field` prints `default: <name>` or `default: none`.
- `list-fields` prints `default: <name>` under a field only when its answer carries `default_value` (that list uses the public API, which may not return it; it never prints a false "none").

## Out of scope
Other field types. Defaults in `create-field`. The `create-task` Mode bug (DGS-645). Any live write to a field.

## First use (the conductor, after the merge; no live write to Jack's Mode field)
1. `dg clickup get-field c89fcfe7-d043-46fd-b6d4-b00995a465d4` shows `default: Autonomous` (Jack set it in the UI).
2. `dg clickup update-field --field c89fcfe7-d043-46fd-b6d4-b00995a465d4 --default Autonomous` prints "already", sends nothing.
3. Dry run with `--default Manual`: the printed PUT body equals the capture body in every key except `default_value.value`. Dry run with `--clear-default`: `default_value` is `null`. Nothing sent.
4. For DGS-645: create a throwaway ticket with `dg clickup create-task` and NO Mode, read its Mode, then set it `discarded` (a status change, never a delete). Comment the result on DGS-645: does an API-created ticket get the field default?
