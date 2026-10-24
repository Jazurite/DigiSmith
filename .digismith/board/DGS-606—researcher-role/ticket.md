# Add the researcher role: a read-only worker that studies outside material and reports

**Key:** DGS-606

A new role `researcher`: a worker that studies outside material (a repository, a tool, an idea) and reports. It sits next to `scout` (internal reads). Its one write: the clone in `~/Workspace/Library/<name>` and its findings file in the depot. No write in the DigiSmith repo, no ClickUp write, no commit, no push. Parents: conductor, maestro. A mandate is required.

Scope (after the Maestro ruling of 2026-10-24): session card (`ROLES`, `LEGAL_PARENT_ROLES`, mandate rule, tests), the role card and brief, the spawn path. The run-role lists moved to DGS-609.

Acceptance: a card with `role: researcher` validates; no mandate or a bad parent fails; a conductor can start a researcher from an order; the card and the brief say it cannot write in the DigiSmith repo; tests cover role value, parents and mandate rule.
