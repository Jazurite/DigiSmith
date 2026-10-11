# Plan: shared task-field options (DGS-14 and DGS-13)

Two pure refactors in `packages/cli/src/clickup/`. No behaviour change. One worker, one branch (`DGS-13__task-field-options-dry`), one small commit per ticket.

## DGS-14: use `TaskFieldArgv`, do not remove it
- Decision: USE it. Both commands replace `argv as unknown as Parameters<typeof buildTaskWriteBody>[0]` with `argv as unknown as TaskFieldArgv`.
- Why: the interface is the documented shape of the flags (the `withTaskFieldOptions` helper below declares exactly these). `Parameters<typeof f>[0]` says the same type through an indirection. A named type keeps the cast honest and gives the helper and `buildTaskWriteBody` one source of truth. Removing the export would keep the indirection and lose the name.
- Commit: `refactor(clickup): use TaskFieldArgv in task commands` (DGS-14).

## DGS-13: `withTaskFieldOptions`
- File: `lib.ts`, next to `TaskFieldArgv` (they describe the same flags). `import type { Argv } from "yargs"`.
- Signature: `withTaskFieldOptions(y: Argv, opts: { parentDescribe: string }): Argv`.
- Declares, in the current order: `description`, `markdown-description`, `markdown-description-file`, `status`, `start-date`, `due-date`, `priority`, `parent`, `type`, `field`. All `requiresArg`, same types and wording as today.
- Stays command-specific (declared in each command before the helper call, so the `--help` order stays): `--list` (create, required), `--task` (update, required), `--name` (required on create, optional on update).
- The only per-command wording is `--parent`, passed as `parentDescribe` (create: "a subtask must be in the parent's list"; update: "moves the task into the parent's list; empty value clears it").
- Handlers, `buildTaskWriteBody` and every message stay as they are.
- Commit: `refactor(clickup): share task-field yargs options` (DGS-13).

## Before/after method
- Before (done, in the session scratchpad): `--help` text of `create-task` and `update-task` through `src/index.ts`, and the output (or error) of `buildTaskWriteBody` for 14 argv cases (`body-cases.ts`, run with `TZ=UTC`).
- After each commit: run the same capture and `diff` against the base. Any difference stops the work.
- Tests at base: `lib.test.ts` 24, `create-task.test.ts` 14, `update-task.test.ts` 19; all of `src/clickup` 312 in 32 files.

## Tests
- New (TDD, written first, seen to fail): in `lib.test.ts`, a `withTaskFieldOptions` describe: it declares the ten shared options with `requiresArg`; `parentDescribe` shows up in the `--parent` description. In each command test file, one test that the built command has the same shared option keys (`description` ... `field`) so the two cannot drift.
- All existing tests stay, no assertion weakened. Per-describe counts compared to base after each test-file edit.
- Full test run at the end (known e2e `--help` colour failure may exist).
