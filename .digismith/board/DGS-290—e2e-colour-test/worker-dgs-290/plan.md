# DGS-290 plan: make the e2e `--help` colour test independent of the terminal

Ticket: DGS-290 (`14zcebrvcxh`, C.2: CLI). Worker `dgs-290`, seat jack.

## Cause
`packages/cli/src/lib/brand-help.ts` colours the headers with `picocolors`. picocolors turns colour on only
with a TTY or `FORCE_COLOR` in the environment, and `NO_COLOR` beats both. The e2e test (`index.e2e.test.ts`,
the `--help` test) spawns the built CLI with the parent's environment and expects the ANSI header
`\x1b[1m\x1b[35mDomains:\x1b[39m\x1b[22m`. With no colour terminal (herdr, CI, Mac Workbox) the CLI prints plain
`Domains:` and the test fails.

## Change (one file: `packages/cli/src/index.e2e.test.ts`)
- `run(args, env?)`: add an optional `env` argument, passed to `spawnSync` as `env: { ...process.env, ...env }`.
- The `--help` test calls `run(["--help"], { FORCE_COLOR: "1" })` and removes `NO_COLOR` from that child env
  (build the env object, `delete env.NO_COLOR`), because picocolors lets `NO_COLOR` win over `FORCE_COLOR`.
- Keep the assertions: one `Usage:` line, and the open-then-close colour check around `Domains:`.
- The other two tests (`--version`, `depot clone bogus`) have no colour or TTY assumption: unchanged.
  I will confirm by running the file without `FORCE_COLOR` (only the `--help` test is expected to fail now).
- No change to the CLI's own colour behaviour. No other file.

## Proof (the change is a test fix, so "red then green" is a plain run)
1. In the worktree on current main: `env -u FORCE_COLOR -u NO_COLOR pnpm --filter @digismith/cli test -- index.e2e`
   fails on the `--help` test (also with `NO_COLOR=1`). Record the output.
2. After the change: the same plain run passes; also with `NO_COLOR=1` in the parent env.
3. Repo-wide: `pnpm test` without `FORCE_COLOR` fully green (report the numbers); `FORCE_COLOR=1 pnpm test` green;
   `pnpm --filter @digismith/cli build` clean.

## Steps after approval
Branch `dgs-290` in `.worktrees/dgs-290` from `origin/main`; the fix; Claude whole-branch review of the diff
(fix only verified findings); `report.md`, `report.html` and this `plan.md` committed together (pathspec, title-only
conventional commits, no attribution); rebase, tests, one-at-a-time merge with hooks 01-03, rebuild, push; close the
ticket with `dg clickup update-task --task 14zcebrvcxh --status done --start-date 2026-10-11 --due-date 2026-10-11`
and read it back.

## First use
None. ClickUp writes: only closing my own ticket after merge and push.

## Left out
A "plain text when colour is off" branch: it would weaken the check (the purpose is the open and close codes).
Changing the CLI to force colour: out of scope.
