# Checkpoint 2: plan (DGS-569)

Plan: `plan.md` in this folder. Status: waiting for `approved: checkpoint 2`.

- One task, one commit: test first (fails on the current brief), then the brief bullet, then the reviewer tests pass.
- Files: `skills/reviewer/brief.md`, `packages/cli/src/reviewer/card.test.ts`. No SDD file, so no overlap with DGS-570 or DGS-568.
- Role mode named: Builder never reviews; key `DGS-569` from `ticket.md`; the Reviewer takes it from the `ticket:` line of `pack.md`; one task STOP, one ticket STOP.
- No dist rebuild (only a test file changes under `packages/cli/src`).
- First use after the merge: the next Reviewer started from the brief for a `ticket: none` pack registers nothing.
- Test command checked: `pnpm --filter ./packages/cli exec vitest run src/reviewer/card.test.ts` runs (10 pass today).
