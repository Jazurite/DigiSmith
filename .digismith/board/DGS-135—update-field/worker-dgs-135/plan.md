# DGS-135 plan: `dg clickup update-field` (Frontdoor API)

Worker `dgs-135`, 2026-10-10 (UTC+7). Checkpoint 1. Nothing outside this folder is changed yet.

## 1. The call: captured, so no new capture needed

Capture `Raw_10_10_2026_12_19_58.folder` (Jack's throwaway field `test`), read with `dg clickup frontdoor dump`. Same host as the task-type calls (Frontdoor, session auth).

| Step | Call | Seen in capture |
|---|---|---|
| Read the field | `GET /customFields/v2/field/{id}` | yes ([65], [68] ...) |
| Rename field | `PUT /customFields/v2/field/{id}`, `name` set, `options.update: []` | yes ([80]: "test" to "test 1") |
| Rename an option | same PUT, `options.update: [{id, name, color, orderindex}]` | yes ([85]: "Option 1" to "Option 1 23", same id, 200) |
| Add an option | same PUT, `options.add: [{name, color, orderindex}]` | yes ([91]) |
| Remove an option | `options.rem` | NOT captured (out of scope, not built) |

PUT is the field in full, not a patch: `id`, `name`, `type_config {sorting, new_drop_down, options {add, update, rem}}`, and the flags `hide_from_guests`, `pinned`, `required`, `required_on_subtasks`, `description`, `private`, `permission_level`, `default_value`, `members`, `groups`. The response is the full field with `options` as a plain list and the ids kept (checked: option ids do not change on rename, so values on tickets stay).

Not captured, so a risk: **Bucket is a space-level ("project") field** and its GET shape has no `sorting` and no `new_drop_down` in `type_config` (the capture of 10-03 shows this). The captured PUTs were on a workspace-level field. The dry run at checkpoint 2 shows the exact body; I use `sorting: "manual"` and `new_drop_down: true` when the read has none, like the web app. If the real PUT answers 4xx, nothing is changed (a rejected PUT writes nothing) and I stop and tell you.

## 2. Command

```
dg clickup update-field --field <id> [--name <new field name>] [--option "<current name or id>=<new name>"]... [--yes]
```

- `--field`: the field id (uuid). Name lookup is not built: there is no captured list call that is cheap for a space-level field, and ids are exact.
- `--option` repeats. Split at the LAST `=`. The left side is the option's current name (case-insensitive) or its id. Names with `=` in the new name are not supported (documented in help).
- At least one of `--name` or `--option` is required: else `nothing to change`.
- Without `--yes`: a dry run. It reads the field (GET, a read), prints the planned call and a diff, and sends no PUT.
- Only `drop_down` fields. Any other type: error (only dropdown bodies are captured).
- Errors (exit code 1, nothing sent): unknown option, option matches more than one, two `--option` for the same option, a new option name already used by another option, a new field name that is empty.
- Option `color` and `orderindex` are sent as read, so order and colour stay.

Code (follows the task-type commands, same files and idioms):
- `packages/clickup-client/src/frontdoor.ts`: `getField(id)` and `updateField(id, body)` on `FrontdoorClient`.
- `packages/clickup-client/src/types.ts`: replace the unused, wrong `FrontdoorFieldPutBody` (its options are `add`-only and carry fields the web app does not send) with the captured shape, plus `FrontdoorField` for the GET. Nothing else uses the old type (grep).
- `packages/cli/src/clickup/update-field.ts`: the command, with a factory taking a client (like `createUpdateTaskTypeCommand`), registered in `index.ts`.
- `packages/cli/src/clickup/field-write.ts`: pure helpers: resolve an option, build the PUT body, build the diff.

## 3. Dry-run output shape

```
field bbc7e23a-... (drop_down)
  name: "Bucket" -> "ClickUp API Type"
  option b31369f7-...: "Frontdoor API" -> "Frontdoor"
  option 518a0820-...: "Public API" -> "Public"
PUT /customFields/v2/field/bbc7e23a-...
{ ...the full body, no header... }
nothing sent; add --yes to send
```
With `--yes` it prints the response JSON (the field read back from the PUT), like the task-type commands. No auth header, cookie or token is ever printed.

## 4. Tests (vitest, fake client, no network)

1. Rename field only: body has `name` new, `options.update: []`, all flags as read.
2. Rename two options by name and by id: `update` carries id, new name, old color, old orderindex.
3. Dry run by default: `updateField` not called, output has `PUT /customFields/v2/field/<id>` and the diff.
4. `--yes` calls `updateField` once with the same body.
5. No `sorting`/`new_drop_down` in the read: body defaults to `manual` / `true`.
6. Errors: unknown option; ambiguous option; duplicate `--option` target; new option name already used; non-dropdown field; nothing to change; empty `--name`. Each with exit code 1 and no PUT.
7. Client tests (`frontdoor.test.ts`): `getField` and `updateField` use the right method and path.
8. `pnpm` only: `pnpm --filter ... test`, typecheck and build as the repo does.

## 5. `--field` question (setting Bucket on DGS-266 and DGS-267)

Setting a field value is a different call (public API `POST /task/{id}/field/{fieldId}` with the option id; `ClickUpClient.setCustomField` already exists) on a different command (`update-task --field`, DGS-136). It is small, but it is a separate command, review and ticket. **Recommendation: separate ticket, DGS-136, not in this build.** Keeps this branch to one Frontdoor call. Until DGS-136 lands, the two tickets get their value in the web app (or the Master orders DGS-136 next; it is a few lines on top of `setCustomField`).

## 6. First use (only after "approved: checkpoint 2"; no ClickUp write before)

After "approved: checkpoint 1" I build on branch `dgs-135` in `.worktrees/dgs-135` (from `origin/main`), tests green, then:

1. Dry run: `dg clickup update-field --field bbc7e23a-bd40-423d-926b-3280ae39928f --name "ClickUp API Type" --option "Frontdoor API=Frontdoor" --option "Public API=Public"`. Report the diff and body (ids and orderindex unchanged) = **checkpoint 2**. Stop.
2. Jack's yes. Then the same command with `--yes` (the built CLI, from the worktree build).
3. Read back: `dg clickup get-task` on DGS-133 (expect `Frontdoor`) and DGS-218 (expect `Public`), field name `ClickUp API Type`; the option ids are the same as before.
4. Report in `report.md`. Push and merge only on Jack's yes; the maestro's merge order carries hooks 01-03.

## Open points for the maestro

- I could not read the ClickUp ticket text of DGS-135/136 (`get-task` takes the ClickUp task id, not `DGS-n`, and I have no id). The call shape comes from the capture, which is the part that matters. If the ticket says something that differs from this plan, tell me.
