# DGS-660 — Implementation Report

Ticket: DGS-660

## What changed
The factory claims a `to do` ticket when it has spec and plan on the ticket, no open blocker, and a Mode that is not Manual. An empty Mode is Autonomous. An empty Sign-off is Auto. The milestone never blocks a claim.

- `ready.ts`: the Sign-off and milestone reasons are gone. The Mode reason is only for `Manual` ("Mode is Manual").
- `scan.ts`: an empty Sign-off becomes `Auto` in the order. Only an explicit `Manual` is skipped. An explicit `Jack` still makes the run stop at acceptance.
- `tracker-clickup.ts`: every ticket but a Manual one is read in full (an empty Mode would otherwise be a light read with no attachments and fail spec and plan). A failed milestone read gives `null` and never fails a scan.
- `schedule-release.ts`: an empty Mode moves like Autonomous. The `no-mode` verdict, text and stop are removed.
- `WATCHDOG.md`, the scan help text, `types.ts` comment and the scheduler job description (`registry.ts`): the new Definition of Ready.

## Rebase on DGS-658
DGS-658 (`50dec3e8`) added `inProjects` and a milestone exception for Projects tickets. The conflict was in `ready.ts` and `ready.test.ts`. Resolved by Jack's rule (agreed by the Maestro): both old lines are removed; the `inProjects` read stays in the tracker; DGS-658's three tests that asserted the old refusal are replaced by one "no milestone passes" test.

## Tests
- ready.test.ts: empty Sign-off, no milestone, empty Mode and explicit Jack pass; Manual fails with "Mode is Manual".
- scan.test.ts: empty Mode claimed; no Sign-off and no milestone claimed with Sign-off Auto; explicit Jack claimed and its order stops at acceptance; Manual skipped.
- tracker-clickup.test.ts: an empty-Mode hit is read in full; a failed milestone read gives null; a failed read is not cached.
- schedule-release.test.ts: an empty Mode moves with no comment.

## Commits
feat(autonomous): claim on empty Mode, Sign-off and milestone; feat(autonomous): empty Mode is Autonomous in the tracker and the schedule release; docs(autonomous): state the new Definition of Ready; docs(autonomous): say any Mode for the scheduled move; docs(scheduler): the scan claims any Mode but Manual.

## Review
Three task reviews and the whole-branch review: Approved, no Critical or Important. Findings in findings.md.

## First use (conductor, after merge and install)
`dg autonomous scan --dry-run --repo <main checkout>` lists DGS-652 and DGS-654 as `ready` and skips the Manual tickets.
