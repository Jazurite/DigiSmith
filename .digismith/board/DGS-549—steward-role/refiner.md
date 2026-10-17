# DGS-549 Refiner output (checkpoint 3)

## Build tickets
One: DGS-549 itself, Tasks 1-6 of `plan.md`, in order. Task 6 (`dg clickup time-in-status`) stays inside this ticket and is built last (Maestro, checkpoint 2). No child tickets.

## Definition of Ready
- [x] Spec approved by Jack (checkpoint 1): `design.html`
- [x] Plan written and checked by the Maestro (checkpoint 2): `plan.md`
- [x] Sign-off field exists (DGS-552) and the Steward only reads it
- [x] No open question: lock timeout (warn, apply nothing, caller resends) and Task 6 placement decided
- [x] Hooks are out of scope (DGS-551 waits on this ticket)
- [x] Each task has its test code, its commands and its expected result
- [x] Live use is read-only: dry run for `event`, one model call for `file` (no ticket created), a read for `time-in-status`
- [ ] Jack moves the ticket to `to do` (gate 1, his quote)

## Sign-off: Auto (proposal)
Internal tooling with a fully defined contract (a new dg command). No look, wording, personal data or public surface. Jack confirms it when he approves into `to do`.
