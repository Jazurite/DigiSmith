# Nexus jobs autonomous-scan and autonomous-report fail: they run the depot clone's source

**Key:** DGS-587
**Story Points:** TBD

## Description

The Nexus registry jobs autonomous-scan and autonomous-report run `node --experimental-strip-types ~/.digismith-depot/repo/packages/cli/src/index.ts autonomous ...`. Both fail every time. The depot clone has no node_modules and no lockfile. The source also does not run under type stripping: `packages/cli/src/autonomous/tracker-clickup.ts:37` uses parameter properties.

## Acceptance Criteria

- The registry DG runs `node <MAIN_CHECKOUT>/packages/cli/dist/index.js` (no strip-types); the registry test is updated.
- No file under `packages/cli/src/` uses syntax that `--experimental-strip-types` refuses (parameter properties, enums, namespaces).
- A smoke test runs `node --experimental-strip-types packages/cli/src/index.ts --help` and `... autonomous --help` in a child process and fails when a source file cannot be type-stripped.
- After the merge the conductor runs `scripts/nexus-api/install.sh`.
