# DGS-551 report (Builder, for the Maestro)

Deviation from the approved spec: no Reviewer hook. Spec 3 had the ticket Reviewer send `review-started` at registration. The ticket review (F1) found it breaks the Reviewer's read-only rule; the Maestro decided to drop it. The Builder's subagent-driven-development hook at `task-start --task final` is the one sender (role mode runs it too). The spec table, the plan, the README and `skills/reviewer/SKILL.md` follow; `hook-wiring.test.ts` pins that no Reviewer file holds a `dg steward event` line.

Other deviations from the plan, all Maestro-approved in review: every skill hook line ends with `|| true` (yargs can fail before the handler) and the sentence says "read the printed line"; the factory reads the profile from the tick's repo; the quote refusal names the approver; `steward/event.ts` is in the status-writer table (the Steward itself).

Not in the repo (untracked in this folder): `maestro-rule.md`, `runbook-edit.md` (the conductor places them after the merge).
