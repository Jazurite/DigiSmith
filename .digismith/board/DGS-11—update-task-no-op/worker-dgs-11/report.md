# DGS-11 report: update-task errors on a no-op write

Worker `dgs-11`, 2026-10-13 (UTC+7). Branch `dgs-11-update-task-no-op`.

## Built
- `update-task` with no change flag now errors `nothing to update: pass at least one of --name, ..., --type, --field` (exit 1), before the client is built. No call, no credential read.
- No-op = empty task body and no `--type` and no `--field`. `--parent ""` and `--description ""` are changes. The check is one helper, `assertSomethingToUpdate`, called right after `buildTaskWriteBody` in `update-task.ts` (DGS-81 adds key resolution after it).
- `lib.ts` is untouched.

## yargs defaults
The real yargs parser gives no default for any change flag: for `--task X` alone the body is `{}`. A test runs the real parser to prove it.

## Tests
`update-task.test.ts`, per describe (base to now): top level 7 to 7, date order 5 to 5, `--field` 4 to 4, markdown description 5 to 5, new "no-op write" 0 to 15. File 21 to 36. One old test called the handler with `--task` only to reach the client; it now passes `--status`. Whole repo: the only failure before that fix was that test; CLI build clean.

## First use
By the conductor after the merge: `dg clickup update-task --task <id>` with no change flag errors.
