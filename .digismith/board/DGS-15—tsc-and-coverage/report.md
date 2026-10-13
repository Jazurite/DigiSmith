# DGS-15: tsc TS2352 in CLI tests — Implementation Report

Ticket: DGS-15
Also: DGS-16 (missing clickup-client test coverage), done on the same branch `dgs-15-tsc-and-coverage`.
Base `3d972f5`. Plan: `plan.md`. Not merged: the merge comes after DGS-88, 12, 11, 81, 267, 332.

## DGS-15: tsc
- Baseline (root `tsc --noEmit -p tsconfig.json`, client built first): **24 TS2352** in 10 CLI test files.
- After: **0 TS2352**.
- Fix: one helper `packages/cli/src/clickup/handler-of.test-util.ts`, `handlerOf<A>(command)`, one `as unknown as`, no `any`. The cast sites in the 10 files now call it (all `command.handler as (...)` forms there, including three that did not trip tsc). No behaviour change.
- `packages/cli/tsconfig.build.json` excludes `src/**/*.test-util.ts`. After `pnpm --filter @digismith/cli build`, `dist` holds no helper and no test file.
- Left alone (out of scope), still reported by tsc: 5 x TS2551 (`getOptions`/`getDemandedOptions` in create-task, update-task, lib tests) and 1 x TS2345 (`scripts/session-cards/card-hook.ts`). Depot tests' `handler as` casts do not trip tsc; untouched.

## DGS-16: tests (all mocked transport; no real ClickUp call)
- `uploadAttachment` sends the base name (`report.pdf`) as the filename. Seen failing when the code sent the full path.
- `uploadAttachment` with a missing file rejects with ENOENT and `request` is never called. Seen failing when a request was made before the read.
- `deleteTask()` sends DELETE /task/{id} (mocked). Added as ordered.
Both mutations were reverted; `client.ts` is unchanged.

## Coverage note
No coverage provider is installed (`@vitest/coverage-v8` absent), none added. Grep-based: each method of `client.ts`, `space.ts`, `frontdoor.ts`, `credentials.ts`, `rate-limiter.ts` is looked up by name in its own test file. A name hit is not proof of a full assertion.
- `client.ts`: 38 methods (the HTTP helpers and the domain methods). Before: 2 had no name hit in `client.test.ts`: `deleteTask` and `delete`. After: only `delete` (the base DELETE helper) has no direct test; deleteTask, deleteList and deleteFolder reach it with a mocked transport. Per the order, no more tests were added for it.
- `space`, `frontdoor`, `credentials`, `rate-limiter`: 0 methods without a name hit in their test files.

## Test counts (per describe, vs base)
Only `packages/clickup-client/src/client.test.ts` changed: "domain write/read methods" 27 -> 28 (+deleteTask), "uploadAttachment" 1 -> 3. All 72 other describes in cli/clickup and clickup-client are equal. Full run: 1855 tests, 0 failed.

## After the rebase
Re-run tsc: other branches may add new casts; fix them with `handlerOf`.
