# DGS-646 plan: `update-field --default`

Spec: `spec.md` in this folder. Facts: `.digismith/sessions/dgs-646/maestro-reads.md`.
Work in the worktree `.worktrees/dgs-646`. Test first in every task.

Setup (fresh worktree): `pnpm install`, then `pnpm --filter @digismith/clickup-client build`.
Run tests: `pnpm vitest run packages/cli/src/clickup`.

### Task 1: Type the default and pin `buildFieldPutBody`
Files: `packages/clickup-client/src/types.ts`, `packages/cli/src/clickup/field-write.ts`, new `packages/cli/src/clickup/field-write.test.ts`.
1. Test first, in `field-write.test.ts` (same `field()` helper shape as `update-field.test.ts`):
   - `buildFieldPutBody keeps an existing default on a rename`: field with `default_value: { value: "Autonomous" }`, one rename, body has `default_value: { value: "Autonomous" }`.
   - `buildFieldPutBody keeps an existing default on add-option`.
   - `buildFieldPutBody sends null when the field has no default`.
   - `buildFieldPutBody sets the asked default`: new parameter `defaultValue` (below) `{ value: "Manual" }` wins over the field's.
   - `buildFieldPutBody clears with null`.
   - `resolveDefault returns the option NAME for a name (any case) and for an id`; `resolveDefault throws "unknown option" and lists the options`.
   - `defaultFollowsRename returns the new name when the current default option is renamed`, and the current default otherwise.
   - `checkDefaultNotRemoved throws when the current default option is removed without a new default or clear`; passes with `--default <other>` or clear.
2. Run the tests: they fail.
3. `types.ts`: add `export interface FrontdoorFieldDefault { value: string }`; type `FrontdoorField.default_value` and `FrontdoorFieldPutBody.default_value` as `FrontdoorFieldDefault | null`. Export it from the client index if `FrontdoorFieldPutBody` is exported there. Run `pnpm --filter @digismith/clickup-client build`.
4. `field-write.ts`: export `findOption` use inside new functions; add
   - `resolveDefault(field, input): FrontdoorFieldDefault` (uses `findOption`, returns `{ value: option.name }`; the unknown-option error already lists the options);
   - `defaultAfterRenames(field, renames): FrontdoorFieldDefault | null` (the current default, with the name replaced if its option is renamed; match the option by the default's value against current option names, case-sensitive);
   - `checkDefaultNotRemoved(field, removes, newDefault: FrontdoorFieldDefault | null | undefined)`: `undefined` = no default flag given; throws `removing "<name>" removes the current default; add --default <other> or --clear-default`;
   - `buildFieldPutBody(..., defaultValue?: FrontdoorFieldDefault | null)`: `default_value: defaultValue !== undefined ? defaultValue : field.default_value ?? null`.
   - extend `describeFieldDiff` with a trailing optional `defaultValue` argument: line `  default: "<old>" -> "<new>"` (`none` for null) when it differs.
5. Run the tests: pass. Run `pnpm --filter @digismith/clickup-client build` and `pnpm vitest run packages/cli/src/clickup`.
6. Commit: `feat(clickup): resolve and carry a dropdown field default`

### Task 2: The flags in `update-field`, with read-back
Files: `packages/cli/src/clickup/update-field.ts`, `packages/cli/src/clickup/update-field.test.ts`.
1. Test first, in `update-field.test.ts`, with the existing `fake()` client. Extend `fake` so `getField` can return a second value for the read-back (`mockResolvedValueOnce`). Names:
   - `--default sets the default by option name`: `--yes`, PUT body has `default_value: { value: "Public API" }`, every other key as read.
   - `--default accepts an option id` (stored by name).
   - `--default dry run prints the diff and the PUT, sends nothing`.
   - `--clear-default sends default_value null`.
   - `--default with an unknown option exits 1 and lists the options`, nothing sent.
   - `--default and --clear-default together exit 1`.
   - `a field that is not drop_down exits 1 with --default`, nothing sent.
   - `--default equal to the current default prints "default already <name>", sends nothing, exit 0` (also with `--yes`).
   - `renaming the current default option moves the default to the new name` (`--option "Public API=Open API"` on a field whose default is Public API; body `default_value: { value: "Open API" }`, `update` has the rename).
   - `removing the current default option exits 1 without --default or --clear-default`, nothing sent; `... passes with --default <other>` (with `--confirm-remove`).
   - `--yes fails with exit 1 when the read-back default differs`: the second `getField` returns `default_value: null`; stderr shows both values.
   - `--yes passes when the read-back default matches` (exit 0).
   - `--yes without a default flag does not read back the default` (existing tests stay green: `getField` is called once).
   - `nothing to change` message now names `--default` and `--clear-default`.
2. Run the tests: they fail.
3. `update-field.ts`:
   - add options `default` (string, `requiresArg`) and `clear-default` (boolean) with a `.conflicts("default", "clear-default")` plus a handler check that throws `--default and --clear-default exclude each other`;
   - add both to the "nothing to change" check and its message;
   - after the dropdown check: `wanted = argv.clearDefault ? null : argv.default !== undefined ? resolveDefault(field, argv.default) : undefined`;
   - if `wanted` equals the current default and there is no other change: `console.log("default already <name>")`, exit 0, return before any PUT. If other changes exist, treat `wanted` as `undefined`;
   - `checkDefaultNotRemoved(field, removes, wanted)`;
   - effective default: `wanted !== undefined ? wanted : defaultAfterRenames(field, renames)`; pass it to `buildFieldPutBody` and `describeFieldDiff`;
   - in the `--yes` branch, after `updateField`: if the default changed (effective differs from the current), `const after = await client.getField(field.id)`; compare `after.default_value ?? null` with the body's by `value`; on a mismatch `console.error` both values and set `exitCode = 1`, return. On a read error, exit 1 with the message (fail closed). Print the updated field JSON as today.
4. Run the tests: pass.
5. Commit: `feat(clickup): update-field --default and --clear-default`

### Task 3: Show the default in `get-field` and `list-fields`
Files: `packages/cli/src/clickup/get-field.ts`, `get-field.test.ts`, `list-fields.ts`, `list-fields.test.ts`, `field-set.ts` (type `FieldLike`).
1. Test first:
   - `get-field prints "default: Autonomous"` for `default_value: { value: "Autonomous" }`.
   - `get-field prints "default: none"` for `null` and for a missing key.
   - `get-field --json` is unchanged (the whole answer).
   - `formatFields prints "    default: Autonomous" under a field whose answer has default_value`.
   - `formatFields prints no default line when the field has none or null`.
2. Run the tests: they fail.
3. `field-set.ts`: add `default_value?: { value: string } | null` to `FieldLike`.
4. `get-field.ts`: after the header line, `console.log(\`default: ${f.default_value?.value ?? "none"}\`)`.
5. `list-fields.ts`: in `formatFields`, after the field line, if `f.default_value?.value` push `    default: <name>`.
6. Run the tests: pass.
7. Commit: `feat(clickup): show a field default in get-field and list-fields`

### Task 4: Docs and final check
Files: the `dg clickup` command docs (search `grep -rn "update-field" --include=*.md . --exclude-dir=node_modules --exclude-dir=.worktrees` for the page that lists its flags; add `--default` and `--clear-default` in the same style, one line each).
1. Run `pnpm --filter @digismith/clickup-client build`, then `pnpm vitest run packages/cli/src/clickup`, then `pnpm -r typecheck` if the repo has that script. All green.
2. No live ClickUp write in any test or step. The first use (spec.md) is the conductor's, after the merge.
3. Commit: `docs(clickup): document update-field --default`
