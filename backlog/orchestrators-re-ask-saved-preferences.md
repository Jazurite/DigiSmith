# Investigate: orchestrators ask Jack what saved preferences and standing rules already decide (merge, push, Sol review, fixing findings)

**Status:** To investigate, Jack (2026-10-10 ~18:0x UTC+7 [11:0xZ]). ClickUp: **DGS-271** (O.1: Preferences Store, task id `14zcebrvcuy`). No design yet.

**Source:** Live session 2026-10-10, end of DGS-214 slice 1. The Desktop session (acting as the Master for B.3) asked Jack, one after another,
to approve the Sol review, to approve fixing Sol's 10 verified findings, and to approve "merge and push". Jack: "you keep telling me to decide
or finish ... and push. But like with the preference skill, you should remember yourself, right?" The session then saved a memory note
(`feedback_follow-saved-preferences`). Jack: "No, no, no. Add a backlog to investigate this, because when you refresh, you will encounter this
same problem." A memory note helps one session; a fresh session, another maestro or a new brief brings the habit back.

## What was already decided

- `finish_option: merge_locally` is saved for DigiSmith's own repo (`.digismith/config.yml`, read by `digismith:preferences`;
  `finishing-a-development-branch` Step 3.5 uses it).
- Push after finishing (Jack's commit rule).
- Sol is the default whole-branch reviewer (DGS-127 lineage, memory `sol-default-reviewer`).
- Review findings the orchestrator has verified get fixed (`receiving-code-review`; on DGS-141 and DGS-214 every verified finding was fixed).

## Where the re-asking comes from (found 2026-10-10)

The preference is honored inside the worker, but the layer above the worker overrides it:

- **Orders and briefs forbid the merge.** The DGS-214 order and brief say "No ClickUp write, no push, no merge"; the `b3-maestro` brief says
  "No push or merge without Jack's yes" (`.digismith/sessions/b3-maestro/brief.md:29`, written by the Desktop session itself). So the worker
  stops before Step 3.5 can apply `finish_option`, and the orchestrator turns the stop into a question for Jack.
- **The runbook frames the merge as an order.** `.digismith/sessions/workbox.md`, "Merge order for a worker": "When the maestro orders a worker
  to merge to `main` (`approved: push`) ...". It says how to merge, not that the saved option already authorizes it.
- **Memory has rules on both sides**: "act at checkpoints" and "follow saved preferences" against older lines that make every push or merge
  Jack's call. A fresh session reads all of them and takes the cautious one.
- **No single list of standing decisions.** Preferences live per repo (`finish_option`); reviewer choice, fixing verified findings and pushing
  live in memory notes and skill text. An orchestrator has no one place to check before asking.

## Questions

- Should orders, briefs and the runbook say "merge per the repo's `finish_option`" instead of "no merge without Jack's yes"? Who updates the
  templates (the order template, the brief template in the E.3 design section 12, the runbook)?
- Should more decisions become preference keys read by the same skill: for example `review_policy: sol_whole_branch`,
  `fix_verified_findings: auto`, `push_after_finish: true`? Per repo (a client repo may differ) or per project?
- A "before asking Jack" check for orchestrators: read the repo's preferences and a short standing-decisions list first, and ask only at the
  order's own checkpoints, on a failed gate (red tests, an unverifiable finding, a merge conflict), on unusual spend, or when nothing covers it.
- Overlap with **DGS-203** (Representative: an agent that decides within Jack's written mandate) and the "maestro relays tiny decisions" item:
  the mandate file may be the natural home for the standing decisions.
- How to test it: a fresh session (after `/clear`) runs a ticket to the finish and must merge and push without asking.

## Related

[representative-decides-for-jack.md](representative-decides-for-jack.md) (DGS-203), [maestro-relays-tiny-decisions.md](maestro-relays-tiny-decisions.md),
`skills/preferences/SKILL.md`, `skills/finishing-a-development-branch/SKILL.md` (Step 3.5), DGS-214 ([count-tokens-per-ticket.md](count-tokens-per-ticket.md)),
DGS-155 (maestro approval inside a guardrail).
