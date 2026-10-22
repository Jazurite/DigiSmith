# Nightwatch UI: runbook text

Nightwatch is the read-only monitoring dashboard for the run record. It shows what the night scan and the workers did, what needs Jack, and what each run cost in steps.

URL: https://pazurite.com/nightwatch/ (no login in v1, see DGS-458).

## After a merge

The Builder runs none of these. The conductor runs them in this order:

1. `pnpm --filter @digismith/cli build`
2. `scripts/nexus-api/install.sh`
3. `scripts/nexus-web/build-www.sh`

## Rule: the API needs the built CLI

The Nexus API reads the run record by running the built CLI (`dg nightwatch view`). It needs `packages/cli/dist/index.js`. If that file is missing, the API answers 503 `reader_unavailable`. Build the CLI, then try again.

## The five screens

Jack opens each screen by its URL:

- Operations: `/nightwatch/` (the overview).
- Attention: `/nightwatch/attention` (items that need Jack).
- Runs: `/nightwatch/runs` (all runs, with filters).
- Run detail: `/nightwatch/run?id=<run-id>` (one run and its event tail).
- Plan: `/nightwatch/plan?ticket=<KEY>` (the plan of one ticket).

The top bar links the first three. Runs, Attention and Operations link to Run detail and Plan.

## First use

With no run yet, every screen shows its empty state. That proves the read path. The next night scan, or `dg run start`, fills Operations and Runs. Jack checks the five screens against that data. The ticket is done when he says yes.

## Out of scope in v1

- Tokens, token burn and seat windows (a follow-up ticket).
- Login (DGS-458).
