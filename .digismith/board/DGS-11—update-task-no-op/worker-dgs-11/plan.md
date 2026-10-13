# DGS-11 — update-task errors on a no-op write: plan

Ticket: DGS-11 (ClickUp 14zcebru205, D.3: ClickUp Channel)

## The rule
A call is a change when the task body is non-empty, or `--type` is given, or `--field` is given at least once.
`buildTaskWriteBody` already sets a body key for every task flag that is present (`!== undefined`), so the check reuses it: no new flag list.

| Flags given (besides --task) | Outcome |
|---|---|
| none | error, exit 1, no client built |
| --name / --description / --markdown-description(-file) / --status / --start-date / --due-date / --priority / --parent X | change, PUT |
| --parent "" | change (body.parent = "none", clears the parent) |
| --description "" | change (clears the description) |
| --name "" | change (sent as is; ClickUp decides) |
| --type X (also "0") | change |
| --field a=b (alone) | change (field write, no PUT) |
| bad flag value (bad date, empty markdown) | its own error first, unchanged |

## Message
`clickup update-task: nothing to update: pass at least one of --name, --description, --markdown-description, --markdown-description-file, --status, --start-date, --due-date, --priority, --parent, --type, --field`
Exit 1 (existing catch block).

## Where
`packages/cli/src/clickup/update-task.ts` only: right after `buildTaskWriteBody` and before `clientFactory()`:
one named helper, `assertSomethingToUpdate(body, argv)`, called right after `buildTaskWriteBody` and before `clientFactory()` (DGS-81 adds key resolution after it). It throws when `Object.keys(body).length === 0`, `argv.type === undefined` and `argv.field` is empty. `fieldArgs` stays where it is. The client is not built, so no call and no credential read. `lib.ts` is untouched (DGS-12 edits it).

## Tests (update-task.test.ts, new describe "no-op write")
- no flags: exit 1, message, factory not called, no update.
- each of the 10 body/type flags alone: not a no-op (parametrised; factory called, update or type lookup reached).
- `--field` alone: not a no-op (existing "skips the empty PUT" test stays green).
- `--parent ""` alone: not a no-op, sends parent "none".
- Per-describe counts reported against base.

## Files
- `packages/cli/src/clickup/update-task.ts`
- `packages/cli/src/clickup/update-task.test.ts`
- plan.md, report.md, report.html (this folder)
