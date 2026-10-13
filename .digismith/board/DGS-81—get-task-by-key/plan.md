# DGS-81 plan: custom task ids (DGS-NN) in dg clickup commands

Ticket: DGS-81

## Now (main 3d972f5)
- `getTaskByRef(ref)` (client.ts) already sends `custom_task_ids=true&team_id` for a key. Used by add-comment, field-set, relation-write.
- Still raw `/task/<id>`, no key support: **get-task** (`client.get`), **update-task** (3 reads + `updateTask` + `applyFields`), **upload-attachment** (`uploadAttachment`), **move-task** (`moveTask`, v3 URL).
- create-task reads `/task/${task.id}` of a task it just made: raw id, no change.

## Change
- `refs.ts`: add `resolveTaskId(client, ref)`: if `KEY` matches, `(await client.getTaskByRef(ref)).id`; else return ref untouched, no extra call (raw id behaves exactly as before). Key pattern reused from `KEY` in refs.ts.
- get-task: key goes through `getTaskByRef(ref, extraParams)`; client.ts gets one optional second argument so `--markdown` still works with a key. Raw id path unchanged (`/task/abc`, no params).
- update-task, upload-attachment, move-task: resolve the id once (update-task: after `buildTaskWriteBody` and `clientFactory`, before any task call; also a non-empty `--parent`), then use the raw id for every later call. Describe text: "ClickUp task ID or key like DGS-411".

## Tests (injected-client pattern)
- get-task: key sends `custom_task_ids: true` and `team_id`; raw id sends no params; key + `--markdown` sends both.
- update-task, upload-attachment, move-task: key -> `getTaskByRef` once, later calls use the resolved id; raw id -> `getTaskByRef` never called.
- refs.ts: `resolveTaskId` unit tests (key, raw id, lowercase key).
- TDD: each test seen failing first. Per-describe counts reported against base.

## Files
get-task.ts, update-task.ts (3 lines near the top, minimal), upload-attachment.ts, move-task.ts, refs.ts, client.ts (getTaskByRef arg only) plus their tests. DGS-88/11/12 touch client.ts/update-task.ts/lib.ts: I merge after them and rebase.

## First use
`dg clickup get-task DGS-411` prints the ticket.
