# DGS-529 Refiner output (checkpoint 3)

Text only. No ClickUp writes. The Maestro creates the tickets, sets the Sign-off field and moves the status.

## Build tickets

DGS-529 stays the parent. It holds the spec (`design.html`) and the plan (`plan.md`, 14 tasks). The build is four tickets, each a subtask of DGS-529, each built from the tasks of `plan.md` named in it, in order. Sizes: S = 1 or 2 small tasks, M = 4 to 6 tasks or a vendored-skill edit, L = more than that. Two more are for later: L1 is filed as DGS-558 (backlog); L2 is filed only if the live check prints `hand`.

| # | Title | Plan tasks | Size | Depends on |
|---|---|---|---|---|
| B1 | `dg reviewer`: pack and table commands (pure code, no skill edits) | 1, 2, 3, 4, 5, 6 | M | none |
| B2 | Session card: `reviewer_type` and `seat`; a reviewer's parent is a conductor or a Maestro | 7 | S | B1 |
| B3 | Role mode in the skills: `review-mode` script, findings section and owner headers on the three primitives, SDD role mode, findings table step in `report-implementation`, PROVENANCE line | 8, 9, 10, 11 | M | B1 |
| B4 | The Reviewer card and brief template, the handoff texts, and the both-paths tests | 12, 13, 14 | S | B1, B3 |
| L1 = DGS-558 (filed, backlog) | Preview step for "Sign-off: Jack" tickets: profile field `preview`, a card section, a recipe run to a preview target only (spec section 8) | new plan when started | S | B4, and a first Sign-off: Jack ticket in view |
| L2 (not filed) | Contingency: the review mode from the session card, if `DIGISMITH_REVIEW_MODE` does not reach a Builder's Bash tool (DGS-553) | new plan when started | S | the live check fails |

Notes on the split:
- B1 is pure code with its own tests. It can merge alone. It breaks nothing: the hand path does not call it.
- B2 and B3 are independent after B1 and run side by side (one worker each). B2 touches `scripts/session-card.ts`. B3 touches `skills/` and `vendored/PROVENANCE.md`. They share no file.
- B4 comes last because its tests read the primitives (B3) and the constants (B1), and its handoff texts describe the finished flow.
- Task 6 edits `packages/cli/src/index.ts`, which the Steward also edits. B1 branches from main after the Steward's merge (done).
- The Maestro pastes `handoff.md` (written by B4) into the runbook and into the DGS-488 and DGS-404 descriptions. That is not a ticket.
- Related, not part of the build: DGS-129 (the Lights-Out engine starts Reviewers by itself), DGS-127 (more tiers), DGS-554 (task to step), DGS-551 (Steward wiring), DGS-537 (Haiku for task reviews), DGS-553 (the token variable that Claude Code strips from Bash).

## Ranking

1. B1: the core. Everything else uses its commands and constants.
2. B3 and B2, together: B3 is the larger and carries the risk (vendored skills), so it starts first. B2 is small.
3. B4: closes the build and proves both paths.
4. Gate, then first use. After B4 merges and before the first role-mode build, the Maestro runs the live check of the mode variable (`handoff.md`, section 4). If it prints `role`, role mode may start. If it prints `hand` with the variable set, file L2 and wait.
5. DGS-558 (L1) and L2: backlog. L1 starts when a "Sign-off: Jack" ticket is about to reach review. L2 starts only if the live check fails.

## Definition of Ready

- [x] Spec approved by Jack (checkpoint 1, with the changes of his final decision): `design.html`
- [x] Plan written and checked by the Maestro (checkpoint 2, with the two additions): `plan.md`
- [x] Decided, not open: the Builder never reviews (task reviews too); one task Reviewer worker per ticket with `/clear` before each pack; the role picks the model (Sonnet 5.5, Opus 5.5 above 800 changed lines, Opus 5.5 for a ticket); the conductor picks the seat inside the seat order; the hand path stays beside the role path; preview as its own ticket
- [x] No open question for a Builder. Each task of `plan.md` has its test code, its commands and its expected result
- [x] The old path is protected: anchor tests on SDD's old text, the `review-mode` tests, the hand-mode table test, and the vendored check (Task 14)
- [x] The conductor's watch of the Builder's pane for `STOP:` lines is written into the card and the runbook text (Maestro's addition)
- [x] Live use is read only. No ticket is written to by a test. The one live check (the mode variable inside a herdr Claude session) is written down step by step in `handoff.md`, section 4
- [x] Dependencies are named: B2, B3 after B1; B4 after B1 and B3
- [ ] Jack moves DGS-529 and its subtasks to `to do` (gate 1, his quote)

Not ready, on purpose: L1 and L2 have no plan yet. Each gets its own refinement when started.

## Sign-off (proposal)

- **B1: Auto.** Internal tooling with a fully defined contract (new `dg` commands, pure functions, tests). No look, wording, personal data or public surface.
- **B2: Auto.** A card schema change with tests. Internal.
- **B3: Auto.** Skill and prompt edits with a defined contract, protected by the old-path anchor tests and the vendored check. Internal.
- **B4: unmarked.** It is the ticket that makes role mode usable. It stays in `review` after the merge until the live check of the mode variable and the first role-mode build are seen working, then the Maestro or a conductor sends `verified`. This is the Steward's rule for unmarked tickets.
- **L1 = DGS-558: Jack.** It raises the Reviewer's permission ceiling by one permission (run a preview recipe) and can deploy a preview. Jack accepts it in `acceptance`.
- **L2 (only if filed): Auto.** A small card-schema and script change with tests.

Jack confirms the marks when he approves into `to do`.
