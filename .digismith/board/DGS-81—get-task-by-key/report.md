# DGS-81 custom task ids in dg clickup — Implementation Report

Ticket: DGS-81

## What changed
- `refs.ts`: `resolveTaskId(client, ref)`. A key (`KEY` pattern) is looked up once with `getTaskByRef` and its real id returned. A raw id passes through with no call.
- `client.ts`: `getTaskByRef(ref, extraParams?)`. Only this method changed.
- `get-task`: a key uses `getTaskByRef` (also with `--markdown`); a raw id keeps the old `/task/<id>` call.
- `update-task`, `upload-attachment`, `move-task`: resolve `--task` once. In update-task the lookup runs after `buildTaskWriteBody` and client creation, before any task call (easy to place after DGS-11's no-op check). In move-task only `--task` is resolved, not `--list`.

- `--parent` (update-task): a non-empty value that is not `none` goes through `resolveTaskId`; an empty value still clears.
- `resolveTaskId`: a 404 on a key throws "task key DGS-999 not found (checked with custom_task_ids and the team id)"; other errors unchanged.
- A lower-case key (`dgs-81`) is detected as a key and sent unchanged; ClickUp decides. No promise that it works.

## Review
Claude whole-branch review: "ready after fixes". Fixed: update-task key test with `--field` and one date flag (real id in every read and write), `--parent` resolution, key 404 message, lower-case wording (no uppercasing), get-task raw id with `--markdown` test, plan.md placement.

## Tests
18 new tests, 1851 -> 1869 passing, 133 files, 0 failures. Per file (it count, base -> now): get-task 3->6, update-task 19->23, upload-attachment 2->4, move-task 4->6, refs 0->5, client getTaskByRef +1. No suite lost.

## First use
After merge: `dg clickup get-task DGS-411` prints the ticket.
