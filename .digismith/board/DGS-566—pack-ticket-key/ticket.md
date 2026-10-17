# Reviewer pack: write the ticket key into pack.md

**Key:** DGS-566 (list B.5: Autonomous Engineering, status refinement; Sign-off: Auto proposed)
**Source:** open Minor finding of the DGS-559 final review (2026-10-17). `pack.md`, written by `dg reviewer pack` (`packages/cli/src/reviewer/pack.ts`), has no ticket line. The Reviewer card (`skills/reviewer/SKILL.md`) tells a reused task Reviewer to take the key from the board folder named in the pack paths.
**Wanted:** a `ticket: <KEY>` line in the manifest, and the card points at it.
**Related:** DGS-529, DGS-560.
**Branch:** `DGS-566__pack-ticket-key`, worktree `.worktrees/dgs-566`. Refinement only: no build until Jack moves the ticket to `to do`.
