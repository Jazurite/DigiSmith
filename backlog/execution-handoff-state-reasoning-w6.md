# Execution Handoff should state its reasoning, not just its choice (W.6 enhancement)

**Status:** Not applied. Captured verbatim per the same "write it down, don't build mid-flight"
pattern used for other backlog ideas surfacing mid-use of an active skill — this came up while
`writing-plans`' Execution Handoff was actively deciding Z.1's execution mode, not while
`writing-plans` itself was being worked on.

**Source:** 2026-09-06, during Model Router Z.1's planning session.

## The idea

`writing-plans`' Execution Handoff section (built by **W.6**, first exercised live for real by
this same conversation choosing `executing-plans` for Z.1's 2-task plan) decides between
`digismith:executing-plans` and `digismith:subagent-driven-development` autonomously, then
"announces the matching outcome" — but the skill's own text only requires announcing *which* one
was chosen, not *why*. Jack asked "why executing plans? It is simple" immediately after the
announcement — a reasonable question, since `executing-plans` (lighter: no subagent dispatch, no
automated per-task reviewer, just self-checked direct execution) doesn't obviously sound like the
"simple plan" option from its name alone, next to `subagent-driven-development` (heavier
machinery) sounding more automated/complex by name. Getting the reasoning only when asked, instead
of alongside the announcement, is friction that a one-line addition to the skill's own instructions
would remove for every future plan, not just this one.

**Proposed fix:** add one sentence to `writing-plans`' Execution Handoff section requiring the
one-to-two-sentence reasoning (task count, risk assessment, relevant precedent if any) to be
stated in the same message as the announcement — not left implicit in the skill's own internal
decision logic the human partner can't see. See `feedback_state_reasoning_for_choices.md` (session
memory) for the general version of this preference, which extends beyond just this one decision
point to any autonomous judgment call a skill hands the controller without asking live.

## Why not applied yet

Surfaced mid-use of `writing-plans` on a live plan (Z.1) — same reasoning as
`finishing-branch-saved-preference.md` and other backlog items captured this way: expanding a
skill's scope again mid-use of it repeats the exact mistake earlier W-lineage work deliberately
avoided. Also genuinely small enough that it doesn't need its own brainstorm/design doc — likely a
one-line addition to the Execution Handoff section's existing instructions, but captured here
rather than edited in immediately per the same discipline.

## Open questions, not yet scoped

- Filed under **W.6** (the Execution Handoff mechanism itself) rather than **W.7** (the
  conflict-scan guard, unrelated) — Jack's own framing left it ambiguous between the two; W.6 is
  the correct owner since W.7 doesn't touch this decision point at all.
- Whether this generalizes to other autonomous choice points `subagent-driven-development` and
  `offload-implementer` already make silently (Model Selection's cheap/standard/most-capable model
  tier choice, the fix-loop breaker's adjudication) — those already produce a ledger entry with a
  one-line rationale in some cases, so may already satisfy the spirit of this request; not audited
  here.
- Whether this is worth its own single-paragraph activation (mirroring W.7's shape exactly) or
  should wait and bundle with some other future `writing-plans`/W-lineage change.
