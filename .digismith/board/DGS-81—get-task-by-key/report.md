# DGS-81 custom task ids in dg clickup — Implementation Report

Ticket: DGS-81

## What changed
- `refs.ts`: `resolveTaskId(client, ref)`. A key (`KEY` pattern) is looked up once with `getTaskByRef` and its real id returned. A raw id passes through with no call.
- `client.ts`: `getTaskByRef(ref, extraParams?)`. Only this method changed.
- `get-task`: a key uses `getTaskByRef` (also with `--markdown`); a raw id keeps the old `/task/<id>` call.
- `update-task`, `upload-attachment`, `move-task`: resolve `--task` once. In update-task the lookup runs after `buildTaskWriteBody` and client creation, before any task call (easy to place after DGS-11's no-op check). In move-task only `--task` is resolved, not `--list`.

## Tests
12 new tests, 1851 -> 1863 passing. Per file (it count, base -> now): get-task 3->5, update-task 19->21, upload-attachment 2->4, move-task 4->6, refs 0->3, client getTaskByRef +1. No suite lost.
Full run: 1 failure, `claude-account` bash test (needs the local environment); it also failed on the base run.

## First use
After merge: `dg clickup get-task DGS-411` prints the ticket.
