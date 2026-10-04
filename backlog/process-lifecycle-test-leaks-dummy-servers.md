# The process-lifecycle test leaks its dummy server processes

**Status:** Not applied. Found 2026-10-04 21:3x UTC+7 [14:3xZ]. ClickUp: **DGS-180** (list C.2: CLI, created 2026-10-04 21:30 UTC+7 [14:30Z], task id `14zcebrurbh`).

**Source:** Jack asked the maestro to close redundant tasks to save RAM. The maestro found 76 orphaned `node -e ... dummy listening on http://127.0.0.1:<port>`
processes (parent PID 1, the oldest 8 days old, the newest 9 minutes old, about 47 MB RSS each, no connections). The string appears in only one place:
`packages/cli/src/depot/process-lifecycle.test.ts` ("starts a real process, tracks its confirmed PID and port, reuses it, then stops it"). The maestro did not
confirm the leak by running the test; that is part of this item. The processes were gone by the time the maestro came to kill them, so nothing was
measured after the kill. The summed RSS (2.2 GB) overstates the real cost, because each process counts the shared Node binary pages.

## The bug

The test starts a real child process with `ensureProcess` and relies on `stopProcess` at the end of the test to kill it. If any `expect` before that call
fails (this test file is one of the known failing files), `stopProcess` never runs, and the child keeps running with no parent. Each run of the suite
on a failing tree adds one more. The `afterEach` only removes the temp directory, so the tracking file that would let anything find the child is deleted too.

## To do

1. Reproduce: run the file, check `pgrep -fc 'dummy listenin[g]'` before and after.
2. Clean up in `afterEach` (or a `try/finally`): call `stopProcess` for the test's `trackingFile` before removing the temp directory, so a failed
   `expect` cannot leave the child behind.
3. Find out why the test fails in this checkout (known failure, `process-lifecycle`), since that is what exposes the leak.
4. Check the other tests that spawn real children for the same shape.
5. A warning in the workbox runbook: a pattern for `pkill -f` must not appear in the command line that runs it (the command's own shell matches and is killed).

## Related

[vitest-worktree-test-discovery-contamination.md](vitest-worktree-test-discovery-contamination.md) (the other known false failures), DGS-117 (the C.2 CLI list),
`.digismith/docs/depot-cli-command-group/plan.md` (where the test was planned).
