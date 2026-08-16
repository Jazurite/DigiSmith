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

**Direction changed 2026-08-16 (Jack):** not a profile toggle that blocks
publishing — auto-cleanup instead. Publish stays on by default; once the
user has reviewed/approved the published artifact (design spec approval,
or having read the implementation report), it gets deleted/unpublished
automatically. This shrinks the exposure window instead of avoiding
publication altogether, and keeps the "readable link" convenience Publish
exists for.

Two things this needs before it can be scoped for real:

- **Feasibility is unverified.** The `Artifact` tool available this
  session only exposes `publish` and `list` actions — no delete/unpublish
  primitive. Confirm whether such a capability exists (perhaps gated
  differently, or added later) before designing around it; if it doesn't
  exist, this whole direction is blocked and the original toggle idea (or
  something else) needs to be revisited.
- **Trigger point is undefined.** "After user approval" needs a concrete
  hook — `brainstorming`'s own "User reviews spec" gate for `design.html`
  publish, but `report-implementation`'s `report.html` publish has no
  equivalent built-in approval step to key off (the report is generated
  and committed in one shot, nothing currently waits on the user reading
  it). Needs its own design pass, not assumed to mirror the spec case.

The original toggle idea (a `publish: true/false` profile field) is still
a fallback if auto-cleanup turns out infeasible — not discarded, just not
the lead option anymore.
