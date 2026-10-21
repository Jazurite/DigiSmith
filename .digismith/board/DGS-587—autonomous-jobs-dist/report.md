# DGS-587 report

Autonomous jobs run the built CLI. Commits 84fa0cb, cdee1f0, 90d76de on main f1e641c.

- Registry: `DG` is `<MAIN_CHECKOUT>/packages/cli/dist/index.js`, no strip-types flag. Missing dist: node prints `Error: Cannot find module '<MAIN_CHECKOUT>/packages/cli/dist/index.js'`, exit 1.
- CLI: plain fields in `tracker-clickup.ts` and `fake-tracker.test-util.ts`.
- Smoke test: strips every `.ts` file under `packages/cli/src`, and runs `--help` and `autonomous --help` under strip-types. It needs `packages/clickup-client/dist` (git-ignored build).
- Review: ticket review r1 ready to merge, F1 Minor fixed in `90d76de`, r2 clean. See `findings.md`.
- Follow-up (parked): use `fileURLToPath` instead of `new URL(...).pathname` in the smoke test.
- After merge: the conductor runs `scripts/nexus-api/install.sh`.
