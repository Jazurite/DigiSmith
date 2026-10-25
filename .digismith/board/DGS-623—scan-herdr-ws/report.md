# DGS-623 implementation report

The Nexus scan job could not prompt the conductor: herdr-ws refuses without HERDR_WS and the job has none.

Shipped (branch DGS-623__scan-herdr-ws, c31c72c..526274f):
- `conductors.json` records the conductor workspace (`workspace`, format `w<digits>`). `promptConductor` passes it as HERDR_WS to herdr-ws and it always wins over the job's own value. `realExec` takes an env argument.
- `runScan` checks the conductor setting before any claim. A bad workspace writes an attention item with cause `conductor-workspace-missing`; an unreadable file, bad JSON or a missing entry gets `conductor-config-unreadable`. The scan returns `conductor-config` and claims nothing. A clean read resolves the item. The dry run prints a `conductor-config: <text>` line and writes nothing.

Checks: whole `src/autonomous` plus `strip-types.smoke` green (786 tests). Full CLI suite 2322 of 2324 once; 2 smoke tests failed on a transient missing clickup-client dist and passed on rerun. One tsc error at `scan.test.ts:144` predates the branch.

Reviews: task 1 (1 Important fixed, 1 Minor), task 2 (2 Minor fixed), ticket review (2 Minor fixed). Table: findings.md. Full detail: report.html.

Not done by the worker, by order: dist rebuild, nexus-api restart, first use.
