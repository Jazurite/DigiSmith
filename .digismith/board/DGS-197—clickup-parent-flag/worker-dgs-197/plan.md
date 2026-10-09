# DGS-197 plan: `--parent` on `dg clickup create-task` and `update-task`

## First test result (2026-10-09, throwaway tasks in C.2 and C.1)
- `create-task` in list C.1 with `parent` set to a task in C.2: **HTTP 400**, `Parent not child of list` (ITEM_137).
- `create-task` in the same list as the parent, with `parent`: **200**, task comes back with `parent` set.
- `update-task` with `parent` on a task in C.1, parent in C.2: **200**. The task comes back with `parent` set **and its list is now C.2**. ClickUp moves it to the parent's list.
- So: a subtask cannot live in a different list. `update-task --parent` moves the ticket for us. `create-task --parent` needs `--list` to equal the parent's list.
- Side effect to warn about: the regroup of the VPS tickets into DGS-182 moves them out of their lists. Statuses may be remapped by ClickUp.
- Throwaways (to archive): parent 14zcebrvbpw, children 14zcebrvbpy, 14zcebrvbpz.

## Tasks (TDD, small diff)
1. `packages/clickup-client/src/types.ts`: add `parent?: string | null` to `ClickUpTaskWriteBody`.
2. `packages/cli/src/clickup/lib.ts`: `TaskFieldArgv.parent?: string`; `buildTaskWriteBody` sets `body.parent = argv.parent` when defined, and `null` when it is the empty string (clears the parent). Tests first in `lib.test.ts`.
3. `create-task.ts`, `update-task.ts`: add `--parent` option. Tests first in their `.test.ts` (body carries `parent`; `--parent ""` sends `null`). Client test: body passes through on POST and PUT.
4. README line for both commands.
5. Acceptance on the throwaway: set parent, read back with `get-task`, clear, read back. Archive all throwaways.

## Open point
Clearing: ClickUp's API wants `"parent": null` to make a subtask top-level. I test that in step 5; if it refuses, I report it.
