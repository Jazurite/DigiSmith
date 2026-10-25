# Review findings

| Reviewer type | Round | Path:line | Severity | What is wrong | Failing scenario | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| task 1 | 1 | scripts/nexus-api/src/oculus-route.test.ts:70 | Minor | The route test uses a fake reader with a hand-built body, so it passes without the views.ts fix. | Revert views.ts: this test still passes. Only the views.test.ts schema parse catches the regression. | accepted (as the plan asked) |
| ticket | 1 | scripts/nexus-api/src/oculus-route.test.ts:68 | Minor | No route test shows the 503 for a null source. | A later change makes lastEvents[].source nullable in overviewViewSchema; no route test fails. | fixed (e6aa41b0) |
| ticket | 1 | packages/cli/src/oculus/views.test.ts:297 | Minor | The fixture run s-m2 (project DigiSmith) is written but no assertion uses it. | A reader assumes the DigiSmith project case is checked; it is not. | fixed (e6aa41b0) |
| ticket | 1 | packages/cli/src/oculus/views.test.ts:6 | Minor | First import from packages/cli into scripts/nexus-shared. | CLI tests run in a checkout without scripts/nexus-shared installed; the import fails. | accepted (the contract tests already cross that line; same repo) |
