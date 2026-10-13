# DGS-12 — Implementation Report

Ticket: DGS-12

## What changed
`buildTaskWriteBody` (packages/cli/src/clickup/lib.ts) now rejects any priority outside the integers 1 to 4. The message is unchanged: `invalid --priority "<v>" — expected an integer 1-4`. create-task and update-task share the helper and call it before the client is built, so a bad value makes no call and exits 1.

## yargs and a non-number
`--priority abc` reaches the helper as NaN (the option is typed number), so the message shows `"NaN"`.

## Tests
- lib.test.ts: priority table, 4 accepted (1-4), 8 rejected (0, -1, 5, 7, NaN, 2.5, Infinity, "3" string).
- create-task.test.ts and update-task.test.ts: through the real yargs parser, `--priority 7`, `0`, `abc` build no client, make no write, exit 1; `--priority 1..4` still write and exit 0.
- Per-describe counts, base -> now (clickup dir 392 -> 417, +25, no describe lost): lib `buildTaskWriteBody` 14 (was 15 incl. the old priority test) + new `priority` 12; create-task parser describe +7; update-task parser describe +7; all other describes unchanged.
- Full cli suite: 68 files, 725 tests pass. `pnpm build` passes.

## Commits
test(dgs-12): priority range tests (seen failing: 8 lib/handler cases), fix(dgs-12): enforce the 1-4 priority range.

## First use (conductor, after merge)
`dg clickup update-task --task <id> --priority 7` is refused before any call.
