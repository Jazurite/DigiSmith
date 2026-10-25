# DGS-645: create-task read-back for `--field` values

## The bug

`dg clickup create-task --field "Sign-off=Auto" --field "Mode=Manual"` made DGS-644 with Mode = Autonomous (orderindex 0). Manual (orderindex 1) was wanted. A later `update-task --field "Mode=Manual"` set it right.

Why it matters: Mode = Autonomous makes a `to do` ticket factory work. A wrong Mode at create can hand attended work to the factory by accident.

Scope: the "create-task defaults Mode to Autonomous" half is dropped. ClickUp's own field default (set in the UI, DGS-646) applies to API-created tickets. Sign-off: Auto. Mode: Autonomous.

## The cause (unproven)

The CLI does not send the wrong option. Read from code and reproduced with a fake client (no live call):

- `create-task.ts:37` calls `resolveFieldArgs` (`field-set.ts`, "Reads the list's fields once"). `resolveValue` (`field-set.ts:62-71`, case `drop_down`) turns the option name into the option **id**, never an orderindex.
- `create-task.ts:38` calls `createTask` with a body that holds NO `custom_fields` (`buildTaskWriteBody`, `lib.ts:89`, never reads `--field`).
- `create-task.ts:40` then calls `applyFields` (`field-set.ts:~178`), which makes one `setCustomField` per field, in flag order: `POST /task/{id}/field/{fieldId}` with `{ value: <option id> }` (`client.ts:288`).
- `update-task.ts:40-45` uses the same `resolveFieldArgs` + `applyFields`. Same code, and it set Mode right.

A throw-away test with fields Sign-off (Auto 0, Jack 1) and Mode (Autonomous 0, Manual 1) gave these `setCustomField` calls:

| flags | calls (field, value) |
|---|---|
| `Sign-off=Auto`, `Mode=Manual` | Sign-off s-auto, Mode m-man |
| `Mode=Manual`, `Sign-off=Auto` | Mode m-man, Sign-off s-auto |
| `Mode=Manual`, `Sign-off=Jack` | Mode m-man, Sign-off s-jack |

All three are right. So Mode=Manual does not become orderindex 0 inside the CLI.

The cause is **unproven**. DGS-644 was created at about 22:05 UTC+7. Jack set the Mode default in the UI at 22:24 (DGS-646), so no default existed at creation: a late default overwriting the value does not explain DGS-644. One possibility stays open, with no proof: ClickUp itself dropped or replaced the value written right after create. DGS-643, made with Mode=Manual, read Manual, so the effect is not constant. This cannot be settled without a live call, and the refinement makes none.

The defect we can fix in our code: **`create-task` trusts the write and never checks it.** Line 41 reads the task back (`client.get`) and prints it, and never compares it with the `--field` values. A wrong value passes silently with exit 0.

## The fix

In `create-task.ts`, after `applyFields` and the `client.get` at line 41, check every resolved field against the task that came back. On a mismatch, exit 1 and print both values.

1. New pure function `findFieldMismatches(task, resolved)` in `field-set.ts`. It returns `{ field: string, wanted: string, got: string }[]`.
   - For each resolved `drop_down`: find the task's `custom_fields` entry with the same `id`. ClickUp returns a dropdown value as the option **orderindex** (a number; this is why the ticket says "value 0"). The wanted orderindex is read from `field.type_config.options[i].orderindex`; also accept a value equal to the option id. Print names, not numbers: `wanted Manual (1), got Autonomous (0)`. An absent value prints `got (empty)`.
   - For `text`, `short_text`, `number`, `currency`, `checkbox`: compare with `===`. Text compares after the same trim `parseFieldArg` does.
   - Skip `date` (ClickUp returns a string of ms; format drift) and relationship fields (the value is a list of tasks, checked by `add-link`-style tools). The skip is documented in a comment. The bug is about dropdowns.
2. `FieldLike.type_config.options` gets an optional `orderindex?: number`.
3. One retry. If there is a mismatch, call `applyFields` again for ONLY the mismatched fields, read the task again, and compare again. This covers the late-default race at no cost to a correct run. If it still differs: exit 1.
4. The failure message goes to stderr: `clickup create-task: task DGS-123 was created, but field "Mode" reads Autonomous (0), wanted Manual (1)`. The task still exists: print its key and id so Jack can fix or discard it. Print the task JSON to stdout as today, so a script keeps the id. `process.exitCode = 1`.
5. `update-task` is out of scope (its existing flow worked). The helper is shared, so a later ticket can add the same check there.

## The first use (conductor, after the merge)

Reproduce the exact failing form of DGS-644.

1. Create ONE throwaway ticket with the same flags as DGS-644, Sign-off first: `dg clickup create-task --list <DigiSmith tasks list> --name "DGS-645 first use (ignore)" --status "to do" --priority 2 --field "Sign-off=Auto" --field "Mode=Manual"`. It has no spec, so the factory scan skips it.
2. Exit 0 from create-task is already the proof, because the read-back passed. Also read Mode and Sign-off back with `dg clickup get-task`: Mode = Manual, Sign-off = Auto.
3. Set the ticket to `discarded` at once. This is a status change, never a delete.
4. Post the result as a comment on DGS-645. If the output shows a retry line or a mismatch, that line is the evidence for the open cause.

## Not in scope

- A default Mode in code (dropped).
- Changing the ClickUp field default (DGS-646, UI).
- A proven cause. If a mismatch shows later, the retry line in the output is the evidence.
