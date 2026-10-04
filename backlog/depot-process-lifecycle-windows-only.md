# `dg depot` process lifecycle is Windows-only, so ensure and stop fail on the Linux VPS

**Status:** Not applied. Found 2026-10-04 21:5x UTC+7 [14:5xZ] by the DGS-180 worker. ClickUp: **DGS-181** (list C.2: CLI, created 2026-10-04 21:5x UTC+7 [14:5xZ], task id `14zcebrurbm`).

**Source:** the DGS-180 worker (`dgs-180`) reproduced the dummy-server leak and found its cause. `packages/cli/src/depot/process-lifecycle.ts` confirms a
started process with Windows tools: `tasklist` (liveness, line 71 and 121), `taskkill /PID /T /F` (stop, line 119) and `netstat -ano`, parsed for
uppercase `TCP` and `LISTENING` (line 27 and 106). On this Linux VPS `tasklist` and `taskkill` do not exist, and `netstat -ano` prints lowercase
`tcp` and `LISTEN` with no PID column. So `ensureProcess` always throws "could not confirm a PID listening on port N via netstat" here, and
`stopProcess` cannot stop anything. The design chose it on purpose: `.digismith/docs/depot-cli-command-group/plan.md` says "Windows is the real target
platform ... use only tasklist, taskkill, netstat". That premise is stale: Windows is retired and the VPS is the single source of truth (Jack, 2026-10).

## What breaks

`ensureProcess` and `stopProcess` are used by `packages/cli/src/depot/bridge/{ensure,stop}.ts` and `packages/cli/src/depot/opencode/{ensure,stop}.ts`. So
on the VPS `dg depot` cannot start or stop the Agentic Bridge or an OpenCode server. The Sol reviewer works around it by starting `opencode serve` by
hand in a herdr pane. The OpenCode-as-maestro direction (DGS-169) would want `dg` to start and stop an OpenCode server, so this blocks that build.
The same file fails `process-lifecycle.test.ts` here (a known failing test), and that test leaks a child on every run (DGS-180).

## To do

1. Decide the platform rule: Linux first, with Windows kept working, or Linux only. Ask Jack: Windows is retired, but the CLI is the product other
   machines may run.
2. Replace the three Windows calls with portable ones: liveness with `process.kill(pid, 0)`, stop with `process.kill(-pid)` on a detached process
   group (or `process.kill(pid)`), and the listening-PID check with `ss -ltnp` on Linux (keep `netstat -ano` on Windows) or a connect-to-port probe.
3. Keep the parsers testable as pure functions: add Linux fixtures (`ss -ltnp` output) beside the Windows ones.
4. Run the depot commands on the VPS end to end (`dg depot opencode ensure` and `stop`) as the acceptance check.
5. Reconcile `process-lifecycle.test.ts` once the real behavior works here (DGS-180 stops the leak first, without this).

## Related

DGS-180 (`backlog/process-lifecycle-test-leaks-dummy-servers.md`, the leak, fixed at its source first), DGS-169 (`backlog/maestro-in-herdr.md`, wants `dg`
to manage an OpenCode server), `.digismith/docs/depot-cli-command-group/plan.md` (the Windows-target decision), DGS-117 (the C.2 list).
