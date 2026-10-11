# DGS-83 plan: dg clickup delete-list (checkpoint 1)

Written 2026-10-11 (UTC+7), worker dgs-83. Nothing is built. No ClickUp write was made. Only reads: the ticket, the brief, the order, the client and the command code.

## Client

`packages/clickup-client/src/client.ts`, next to `deleteTask`:

```ts
/** DELETE /list/{id}. ClickUp answers {}. Whether it is a trash delete or a permanent one is not known yet (DGS-83). */
async deleteList(listId: string): Promise<void> {
  await this.delete(`/list/${listId}`);
}
```

No new type. No new read method: the check uses the existing `getListTasks(listId, opts)`.

## The "holds anything" check (read only, one paged call)

```ts
client.getListTasks(list, { params: { include_closed: true, subtasks: true, archived: true } })
```

`GET /v2/list/{id}/task` with `include_closed=true`, `subtasks=true`, `archived=true` (the public API param that includes archived tasks; `getAllListTasks` does NOT pass it, so I do not use it here). `paginate` walks every page until one is empty. Any result at all means refuse.

One open point: I know `archived` from the ClickUp public API docs for Get Tasks, I have not run it. The checkpoint-2 dry run on a real list will show it works (read only). If a list has archived tasks, the dry run will show them.

## Command `packages/cli/src/clickup/delete-list.ts` (new, modelled on move-folder)

Flags: `--list <id>` required, digits only; `--yes` boolean, default false.

Flow:

1. Validate `--list` (digits only), before any call.
2. Read the tasks (above). This happens with and without `--yes`, so a dry run already tells you if the real call would be refused. (Brief says read first with `--yes`; reading in the dry run too is my addition. It is read only. It means the dry run needs the API token, as `list-tasks` does. Say no and I read only with `--yes`.)
3. If the list holds any task: print the refusal, exit code 1, no DELETE sent, also with `--yes`.
4. Empty list, no `--yes`: `printCall("DELETE", "/list/<id>", undefined)`, then `list is empty; nothing sent; add --yes to send`.
5. Empty list, `--yes`: `deleteList`, print `deleted list <id>; check it with dg clickup get-lists`, exit 0.

Refusal output (stderr, exit 1):

```
clickup delete-list: list 1301150000002402 holds 3 tasks (archived and closed included); delete refused. Move or delete them first.
  86abc12  Some task name
  86abc13  Another one
  86abc14  Third
  ... and 1 more
```

Count, then up to 5 `id  name` lines, then "... and N more". The id is the task `id`.

Errors: `clickup delete-list: <message>`, exit 1, as the model.

Registered in `packages/cli/src/clickup/index.ts` next to `moveFolderCommand` (a 2-line change, a rebase conflict at most).

## Tests (TDD, vitest, pnpm, mocks only, no real delete)

`packages/clickup-client/src/client.test.ts`:
- `deleteList` sends DELETE `/list/<id>` and returns nothing.

`packages/cli/src/clickup/delete-list.test.ts` (mock client factory, like move-folder.test.ts):
- rejects a missing, non-numeric `--list` (exit 1, no client call).
- the task read passes `include_closed`, `subtasks`, `archived` all true.
- empty list, dry run: prints `DELETE /list/<id>`, "nothing sent", `deleteList` not called, exit 0.
- empty list, `--yes`: `deleteList` called once with the id; exit 0.
- list with tasks, dry run: prints the refusal, exit 1, `deleteList` not called.
- list with tasks, `--yes`: same refusal, exit 1, `deleteList` NOT called (the main test).
- refusal lists count and at most 5 tasks, "... and N more" beyond.
- the read fails (API error), `--yes`: exit 1, `deleteList` not called.
- the delete fails: message printed, exit 1.

## Allow rule: a decision for Jack (recommendation)

The brief says move-folder's rule is `Bash(dg clickup move-folder:*)`; its `:*` also lets `--yes` through with no prompt. For a DELETE I recommend NOT copying that. Recommended instead: allow only the dry run, so every real delete prompts:

```
"Bash(dg clickup delete-list --list * )"  
```

Exact pattern needs care: Claude Code prefix rules match the command start, and a `*` in the middle matches any text, including a trailing ` --yes`. I do not know a rule form that allows "no --yes". So the safe options are:

1. Add NO allow rule for delete-list. Every call, dry run and real, prompts. Safest, costs a prompt on the dry run.
2. Add `Bash(dg clickup delete-list:*)` like move-folder. A `--yes` delete runs unprompted. The empty-list check and the DGS-363 dry-run-then-yes flow are the only guards.

My recommendation is option 1 (no rule, maybe revisit when the first real use shows the dry run prompt is annoying). I will add no rule unless the maestro or Jack picks option 2. If it is unsure, the maestro parks this for Jack.

## Open question for the report (DGS-363 checks it at the first real use)

After a real `delete-list`: does `GET /list/{id}` still return the list with `deleted: true` (trash delete, like the frontdoor one), or 404 (permanent)? `get-lists` read back shows only whether it left its folder; the `GET /list/{id}` call is the real answer.

## Files touched

New: `delete-list.ts`, `delete-list.test.ts`. Small edits: `client.ts` (+1 method), `client.test.ts`, `cli/src/clickup/index.ts` (+2 lines). `.claude/settings.json`: none under option 1.
