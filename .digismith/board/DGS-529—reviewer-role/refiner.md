# DGS-529 Refiner output (checkpoint 3)

Text only. No ClickUp writes. The Maestro sets the Sign-off field and moves the status.

## Build tickets

One: DGS-529 itself. One Builder, one branch, Tasks 1 to 14 of `plan.md`, in order. No subtasks (Maestro, checkpoint 3: Jack wants fewer tickets). Size: L (14 tasks: new `dg reviewer` code, a card schema change, vendored-skill edits, the card and brief, both-path tests).

The order inside the build matters. The plan already follows it:
- Tasks 1 to 6: `dg reviewer` pack and table. Pure code. They break nothing: the hand path does not call them.
- Task 7: card fields. Needs Task 1 (its test imports the constants).
- Tasks 8 to 11: `review-mode`, primitives, SDD role mode, `report-implementation`. These are the vendored-skill edits. They come after the commands they name.
- Tasks 12 to 14: the card and brief, the handoff texts, the both-paths tests and the vendored check. Last, because they read everything before.

Task 6 edits `packages/cli/src/index.ts`, which the Steward also edits. The Builder starts from main after the Steward's merge (done).

Filed separately:
- **DGS-558** (backlog, Sign-off: Jack): the preview step for "Sign-off: Jack" tickets (spec section 8).
- **L2**, filed only if the live check prints `hand`: take the review mode from the session card.

The Maestro pastes `handoff.md` (written by Task 13) into the runbook and into the DGS-488 and DGS-404 descriptions. That is not a ticket.

Related, not part of the build: DGS-129 (the Lights-Out engine starts Reviewers by itself), DGS-127 (more tiers), DGS-554 (task to step), DGS-551 (Steward wiring), DGS-537 (Haiku for task reviews), DGS-553 (the token variable Claude Code strips from Bash).

## Ranking

1. Build DGS-529 (Tasks 1 to 14).
2. The live check of the mode variable, before the first role-mode build. The Maestro runs it with `handoff.md`, section 4. `role` printed: role mode may start. `hand` printed with the variable set: file L2 and wait.
3. First role-mode use on a real ticket. Then `verified`.
4. DGS-558 and L2 stay in the backlog.

## Definition of Ready

- [x] Spec approved by Jack (checkpoint 1, with the changes of his final decision): `design.html`
- [x] Plan written and checked by the Maestro (checkpoint 2, with the two additions): `plan.md`
- [x] Decided, not open: the Builder never reviews (task reviews too); one task Reviewer worker per ticket with `/clear` before each pack; the role picks the model (Sonnet 5.5, Opus 5.5 above 800 changed lines, Opus 5.5 for a ticket); the conductor picks the seat inside the seat order; the hand path stays beside the role path; the preview step is DGS-558; DGS-529 is one ticket
- [x] No open question for a Builder. Each task of `plan.md` has its test code, its commands and its expected result
- [x] The old path is protected: anchor tests on SDD's old text, the `review-mode` tests, the hand-mode table test, and the vendored check (Task 14)
- [x] The conductor's watch of the Builder's pane for `STOP:` lines is in the card and the runbook text (Maestro's addition)
- [x] Live use is read only. No ticket is written to by a test. The one live check (the mode variable inside a herdr Claude session) is written step by step in `handoff.md`, section 4
- [ ] Jack moves DGS-529 to `to do` (gate 1, his quote)

## Sign-off: unmarked (decided by the Maestro)

DGS-529 has no Sign-off mark. After the merge it stays in `review` until three things are seen working: the push, the live check of the mode variable, and the first role-mode use. Then the Maestro or a conductor sends `verified` and the ticket is done. This is the Steward's rule for unmarked tickets.
