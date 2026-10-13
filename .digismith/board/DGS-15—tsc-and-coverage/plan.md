# DGS-15 + DGS-16: tsc TS2352 in CLI tests, client test coverage

Ticket: DGS-15 (also DGS-16). Branch `dgs-15-tsc-and-coverage`, worktree `.worktrees/dgs-15`, base `3d972f5`.

## Baseline (DGS-15)
Command: `pnpm --filter @digismith/clickup-client build` then `pnpm exec tsc --noEmit -p tsconfig.json` (root tsconfig; includes `packages/cli/src` and `scripts`). Without the client build, tsc adds ~140 TS2307 errors ("Cannot find module @digismith/clickup-client"); that is a missing build, not a defect.
- TS2352: **24** errors in 10 test files: create-folder 2, create-list 5, create-task 3, get-lists 2, get-task 3, list-tasks 2, move-task 1, update-list 1, update-task 3, upload-attachment 2 (all in `packages/cli/src/clickup/`).
- Not in scope, left alone: TS2551 x5 (`getOptions`/`getDemandedOptions` in create-task, update-task, lib tests) and TS2345 x1 (`scripts/session-cards/card-hook.ts`). I list them in report.md.
- The 4 `handler as` casts in `depot/` tests do not trip tsc; I leave them.

## Helper design
One small shared helper: `packages/cli/src/clickup/handler-of.test-util.ts`:
```ts
export function handlerOf<A>(command: CommandModule<object, A>): (argv: A) => Promise<void> {
  return command.handler as unknown as (argv: A) => Promise<void>;
}
```
One `as unknown as` in one place; no `any`; the argv type stays per call site. Each test replaces `command.handler as (argv: X) => Promise<void>` with `handlerOf<X>(command)`. No behaviour change.
Open point: the build config excludes only `*.test.ts`, so a `*.test-util.ts` file would ship in `dist`. I add one line to `packages/cli/tsconfig.build.json` exclude (`src/**/*.test-util.ts`). Tell me if you prefer to leave the build config alone (then the helper is a `.test.ts`-free file in dist).

## Files to touch
The 10 test files above, the new helper, `tsconfig.build.json` (1 line). Client: `packages/clickup-client/src/client.test.ts` (2 tests). Nothing else. After rebase on the new main I re-run tsc and fix any new casts.

## DGS-16 tests (client.test.ts, in `ClickUpClient uploadAttachment`)
1. Filename: send a file named `report.pdf`; assert `(sentForm.get("attachment") as File).name === "report.pdf"` (basename, not the full path).
2. Missing file: `uploadAttachment("abc", "<tmp>/missing.pdf")` rejects with ENOENT and `request` is never called.
TDD: both likely pass at once (the code is right; the tests were missing). To see them fail I mutate the code temporarily (basename -> filePath; read after request) and revert.

## Coverage measure
No coverage provider is installed (`@vitest/coverage-v8` absent) and I add none. Grep-based: each method in `client.ts`, `space.ts`, `frontdoor.ts`, `credentials.ts`, `rate-limiter.ts` checked against its test file. First result: `ClickUpClient.deleteTask` has no test; `delete` needs a look (possibly a private helper). `space`, `frontdoor`, `credentials`, `rate-limiter`: every method is named in its test file. Numbers (methods, tested, untested) go in report.md. A name hit is not proof of an assertion; I say so in the note.

## Test counts
I record per-describe test counts before and after for every edited test file (the helper swap must not change them).
