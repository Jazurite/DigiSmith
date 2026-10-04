# Branch naming should follow "a key is available", like the board folder

**Status:** Idea, raised by the DGS-159 Part 3 worker (2026-10-04 10:24 UTC+7 [03:24Z]) and filed by the maestro under the automatic-ticket
rule. No design yet. ClickUp: **DGS-166** (list E.3: Conventions, created 2026-10-04 10:26 UTC+7 [03:26Z], task id `14zcebruqt5`).

**Source:** the DGS-159 Part 3 design, `.digismith/board/DGS-159—ticket-based-naming-code-and-files/worker-dgs-159-lifecycle/design.html`,
section 7.

## What is inconsistent

- Part 3 makes the board folder follow "a tracker key is available": `.digismith/board/<KEY>—<slug>/` when a key is in hand, and
  `.digismith/board/<slug>/` only when there is none.
- The branch name still follows the strict `ticket:` profile flag (`digismith:bootstrap` Step 2): `<Key>__<slug>` for a `ticket: true`
  repo, a bare `<slug>` for `ticket: false`. DigiSmith's own repo is `ticket: false` and its tickets carry a DGS key, so a ticket gets a
  keyed folder (`DGS-161—plugin-update-after-merge`) and a keyless branch (`plugin-update-after-merge`).
- It works because Part 3 makes `digismith:init` resolve the board folder by slug, whatever key it carries. But the two names now
  follow two different rules.

## Question

Should the branch be `DGS-161__plugin-update-after-merge` whenever a key is available, the same way as the folder? The answer touches
`digismith:init` resume detection and worktree reuse, `digismith:bootstrap` Step 2, `digismith:adopt`'s branch-slug correction, the
worktree folder names under `.worktrees/`, and any script that reads a branch name.

## Open questions

- A key in the branch name changes every existing in-flight branch's expected name. How do old branches resume?
- Does the worktree folder name carry the key too?
- Does the key-in-branch rule need the `ticket:` profile flag at all, or is "a key is in hand" enough everywhere?

## Related

[worker-and-maestro-conventions.md](worker-and-maestro-conventions.md) (DGS-158), DGS-159 (Part 3 and Part 4),
[backfill-tickets-for-historical-docs.md](backfill-tickets-for-historical-docs.md) (DGS-164).
