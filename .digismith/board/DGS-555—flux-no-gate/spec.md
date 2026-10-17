# DGS-555 spec: flux clears without the check gate

## Problem
Baseline (read of `skills/handoff/SKILL.md` today): a manual "flux" or "hand off and clear" writes the note, then the
Check Gate says "Every clear waits for the human partner ... Fix anything, or say ok to clear." The turn ends without a clear.
Jack's order to flux already is the confirmation. Only the "kicker open? flux now?" yes skips the gate today, and it does not clear.

## Change (all in `skills/handoff/SKILL.md`)
1. Invoked By: write-then-clear triggers gain "flux" and "flux it".
2. Clear Decision, manual run: a message that asks for a clear writes the note, shows it, gives the final summary
   with `Handoff note: <path>`, and calls `clear_session` self as the last action of the same turn. No gate line.
3. Kept: no note written (or write failed) = no clear; the "kicker open? flux now?" path (write and show, no clear);
   conductor flux stays night-only (not this skill).
4. End-of-ticket mode keeps its gate (the `clear_context` preference, saved `yes` included). The Check Gate section
   covers only that mode; its kicker exception moves to Clear Decision, where the manual run is described.
5. Common Rationalizations: rewrite the row "Every clear waits for ... ok" to match 1-4; the "only an explicit ask
   clears" row stays (an explicit ask is exactly what clears now).
6. Grep of skills, scripts, docs and the runbook found no other "say ok to clear" text; nothing else to change.

## Reason
Technical choice: keep the gate in end-of-ticket mode because the clear was not asked in the message there.

## Test
Pressure scenarios, read against the new text: (a) "flux" with a written note -> clears same turn; (b) write fails -> no clear;
(c) "kicker open? flux now?" yes -> no clear; (d) end-of-ticket, `clear_context` yes -> gate; (e) plain "hand off" -> no clear.
