# dg CLI e2e test fails without a colour terminal (index.e2e --help header check)

**Status:** Idea, Jack (2026-10-10 ~20:3x UTC+7 [13:3xZ]). ClickUp: **DGS-290** (C.2: CLI, task id `14zcebrvcxh`). No design yet.

## Problem

`packages/cli/src/index.e2e.test.ts` line 66, "--help exits 0 with a single Usage line and a properly-closed colorized Domains header",
expects the ANSI-coloured header `\x1b[1m\x1b[35mDomains:\x1b[39m\x1b[22m`. It fails whenever the run has no colour terminal (herdr panes,
CI, the Mac Workbox) and passes with `FORCE_COLOR=1`. Every repo-wide run since the Mac move shows it (2026-10-05: 844 of 846; DGS-135
merge 2026-10-10: 1 failure of 1,106), so every worker reports it as "known, not mine".

## Fix

Make the test independent of the terminal: spawn the CLI with `FORCE_COLOR=1` in the test's own environment (keeps the open-and-close
colour check), or assert the plain text when colour is off. Keep the test's purpose: both the open and the close codes are present.
