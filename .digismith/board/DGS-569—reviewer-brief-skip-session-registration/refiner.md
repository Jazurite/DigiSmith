# Refiner part: DGS-569

## Build tickets

One. DGS-569 is the build ticket: the plan has one task and one commit. No new ticket, no split (two files, one reviewable diff).

## Definition of Ready

| Item | State |
|---|---|
| Spec | `design.html` in this folder (checkpoint 1 approved) |
| Plan | `plan.md` in this folder (checkpoint 2 approved), role mode named |
| Files | `skills/reviewer/brief.md`, `packages/cli/src/reviewer/card.test.ts`. No SDD file. |
| Blocking dependency | None open. DGS-570 and DGS-568 may touch `skills/subagent-driven-development/`; this plan does not, so they are not blockers. Related DGS-566 and DGS-529 are done. |
| Sign-off mark | Auto (proposed). The field `Sign-off` is empty on the ticket today. The Maestro sets it: I make no ClickUp write. |
| Milestone | Not set on the ticket today. Proposal: Dawn (role-mode review is part of V1 autonomous engineering). The Maestro's call. |
| Priority | Normal (set) |
| Board files | Committed on branch `DGS-569__reviewer-brief-skip-session-registration`, worktree `.worktrees/dgs-569` |

## Sign-off: Auto

Internal tooling, a template text change with a test. Done at merge and push. The first use (a Reviewer started from the brief for a `ticket: none` pack) may come much later. It does not hold the ticket.

## Status

The ticket stays in `refinement`. The Maestro moves it to `to do` after the Sign-off and Milestone fields are set.
