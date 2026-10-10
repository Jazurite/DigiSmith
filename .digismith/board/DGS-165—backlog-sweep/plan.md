# DGS-165 and DGS-164: backlog and docs sweep, phase 1

**Checkpoint 1 (read-only), 2026-10-10.** Worker `dgs-165`, Scout. No ClickUp write, no git change except these board files.

## Totals
| Kind | Count | Has a key already | Found in ClickUp | No ticket |
|---|---|---|---|---|
| `backlog/*.md` items | 138 (+ `README.md`) | 79 | 23 | 36 (35 new tickets + 1 history-only) |
| `.digismith/docs/` leaf folders | 79 | 0 (no `ticket.md` anywhere) | 78 (72 high, 5 medium, 1 low) | 1 (`vitest-worktree-contamination`, pairs with a backlog file) |

Tables: [table-backlog.md](table-backlog.md), [table-docs.md](table-docs.md). Flags: [flags.md](flags.md).
Source: `dg clickup list-tasks` on all 42 lists of the DigiSmith space, 278 tasks, closed ones included.

## New tickets proposed (35), by list
A.1 Primitives 11, C.1 Workbox 5, E.4 Workflows 4, A.3 Lifecycle Hooks 4, E.2 Toolchain 2, F.6 Integrate and finish 2, and one each in D.1, O.1, O.3, E.1, F.7, G.0, C.2.
Each carries the file's text as the description, the file's status line, and a pointer to the source file. Status `backlog` (`concept` for the medium-confidence ones). Five merge candidates in [flags.md](flags.md) would cut the count to about 31 if Jack chooses to merge.

## Proposed batch rule
1. Jack approves this list once (the table, with his edits to lists and names, and his choice on each merge or discard flag).
2. The worker creates the tickets with `dg clickup create-task` in batches of 10, never more than 20, one batch per Jack-visible status line.
3. After each batch it reads every ticket back with `get-task` (name, list, status, description, type) and stops at the first mismatch.
4. Then it writes each key into its file (status line) and the README index line, one commit per batch, title-only conventional, on a branch.
5. Keys found for the 23 matched files and the key mentions for the docs go in a first commit; no ClickUp write is needed for them.
6. Merge only on Jack's yes. No ticket is ever deleted; a rejected ticket is set to a discard status.

## Decisions I need from Jack
1. Approve the table, or give edits (lists and names for the 35).
2. Per flag: merge, discard, or keep (20 done-ticket files, 6 doubtful, 5 merge candidates).
3. Is a docs folder with two tickets (a skill and its lifecycle-stage twin) recorded under the first key only, or under both? Default: both in the file, first key in the index.
4. The 9 missing keys (DGS-3, 4, 60, 61, 74, 199 to 202): leave as they are.
5. The batch rule above.

Out of scope (later checkpoint): moving content into `.digismith/board/`, the `history.html` link problem, the fate of `backlog/README.md`.
