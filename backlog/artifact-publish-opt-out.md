# `report-implementation`'s Artifact-publish has no independent opt-out

**Status:** Not applied — committed fast-follow, not a someday-maybe.
Jack decided 2026-08-15 to ship Task 3's unconditional publish step as
designed (see the plan's own risk flag below) and pick this up
immediately after Enforcer (Q) ships, rather than blocking or expanding
this build to gate it now.

**Source:** Jack's own observation, 2026-08-15, prompted by writing the
Enforcer (Q) plan's `report-implementation` addition (Task 3). Escalated
mid-build when the harness's own instruction-poisoning check flagged
Task 3's unconditional publish as conflicting with the Emma
theme-repo convention (`docs/development-workflow.md`: progress reports
are gitignored, copied into Jira manually — private by design). Jack's
call: ship now, fix immediately after, not before.

## The gap

Task 3 of the Enforcer (Q) plan adds an unconditional "publish
`report.html` via the `Artifact` tool" step to `report-implementation`,
gated only by the existing `reporting` profile field — the same flag that
decides whether a report gets generated at all. There's no separate
toggle for "generate the report locally, but don't publish it
externally."

## Why this might matter

A consumer repo's implementation report can contain proprietary code
snippets, client-specific business logic, or other content a profile
might reasonably want kept local-only even when reporting itself stays
on. Right now, turning `reporting: true` also means "and publish it to a
Claude.ai Artifact link," with no way to decouple the two.

## Where this would land, not yet decided

**Direction tried and closed 2026-08-16:** auto-cleanup (publish stays on,
delete/unpublish the artifact automatically once the user has
reviewed/approved it) was considered as an alternative to a blocking
toggle. Jack confirmed the same day it's infeasible: there is no
per-artifact delete/unpublish capability — the only deletion mechanism
available is deleting the entire conversation the artifact was published
from, which isn't a usable per-artifact cleanup primitive. This direction
is closed, not just deprioritized.

**Back to the original idea:** a new profile field (e.g. `publish:
true/false`) sitting alongside `reporting` in `profiles/<name>.yml`,
consulted by both `report-implementation`'s publish step and
`digismith:enforcer`'s own `design.html` publish step. Still not scoped —
open question is whether `reporting: false` is judged sufficient on its
own (skip generating the report entirely, sidestepping the need for a
separate flag) versus wanting reports generated-but-not-published as a
genuinely distinct state.
