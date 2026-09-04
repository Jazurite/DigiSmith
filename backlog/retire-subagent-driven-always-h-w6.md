# Retire subagent-driven-always (H) into writing-plans, with complexity-based reasoning (new letter W.6)

**Status:** Not applied. Captured mid-execution of W.5 (Q's retirement) — deliberately not folded
into that already-approved plan.

**Source:** 2026-09-04, same session as W.4/W.5.

## The idea

Two related changes, surfaced together:

1. **Retire map item H** the same way W.5 retires Q: `digismith:subagent-driven-always` currently
   intercepts `writing-plans`' Execution Handoff step externally (see
   `skills/enforcer/SKILL.md`'s own note on the timing coincidence, now moot once Q is retired).
   Fold that interception directly into `writing-plans`' own vendored content instead, delete the
   standalone `subagent-driven-always` skill, and free letter H for future reuse — same pattern as
   W.5.
2. **Change the actual policy, not just its location.** Today H's rule is absolute: "there is no
   option 2" (inline execution never offered). Jack's proposed replacement: reason about task
   complexity autonomously and pick — simple/single-sequencing tasks → inline execution; multi-task
   work needing 2+ subagents → always subagent-driven. Still never asks the user which to use
   (that question stays killed) — the decision itself just stops being a hardcoded constant and
   becomes a judgment call the primitive makes each time.

## Why not folded into W.5

W.5 was already brainstormed, specced, approved, and is mid-execution via
`subagent-driven-development` when this was raised. Expanding an approved plan's scope during its
own execution defeats the point of approving a spec first — this needs its own brainstorm/spec/
plan cycle, the same rigor W.5 got.

## Open questions, not yet scoped

- Where exactly does the complexity-reasoning logic live — inside `writing-plans`' own Execution
  Handoff section (replacing H's hardcoded interception), or does it need supporting detail (what
  counts as "simple sequencing" vs. "multi-task" — a concrete threshold or heuristic)?
- Does this affect `subagent-driven-development`'s own vendored copy too, or only the
  `writing-plans` handoff point that currently triggers H?
- Same letter-freeing precedent as Q → W.5: confirm H is genuinely fully absorbed (no residual
  external call-sites) before marking it retired in `MEMORY.md`.

## Why not applied yet

Idea only, captured verbatim per the same "write it down, don't brainstorm mid-flight" pattern
used earlier this session for K.8 and the VPS-hosting idea (X).
