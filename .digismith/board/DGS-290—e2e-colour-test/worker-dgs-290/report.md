# DGS-290 report: the e2e `--help` colour test no longer depends on the terminal

Status: built and committed on branch dgs-290.

- Cause: the CLI colours its help headers with `picocolors`, which turns colour on only with a TTY or `FORCE_COLOR`, and `NO_COLOR` beats both. The e2e test spawned the CLI with the parent environment, so it failed in herdr, CI and the Mac Workbox.
- Fix, one file `packages/cli/src/index.e2e.test.ts`: `run()` takes an optional `env`; the `--help` test spawns with `FORCE_COLOR=1` and `NO_COLOR` removed. The open-then-close colour assertion is kept. The CLI's own colour behaviour is unchanged. The `--version` and `depot clone bogus` tests have no colour or TTY dependency.
- Red first, on current main in the worktree: `env -u FORCE_COLOR -u NO_COLOR pnpm --filter @digismith/cli test` failed 1 of 601 (the `--help` test). After the change the same run passes 601 of 601, also with `NO_COLOR=1` in the parent environment.
- Repo-wide `pnpm test`: without `FORCE_COLOR` 1348 of 1348 (106 files); with `FORCE_COLOR=1` 1348 of 1348. No other failure.

## Review
Claude whole-branch review (subagent) of the diff against origin/main: no findings (no correctness bug, types fine, the other two tests unaffected).
