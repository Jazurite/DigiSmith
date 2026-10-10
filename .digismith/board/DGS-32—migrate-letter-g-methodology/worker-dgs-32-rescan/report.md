# DGS-32 rescan: letter G against clan E (Scout, read-only)

Done 2026-10-10 (UTC+7). Read only. I wrote no ClickUp data and changed no repo file except this report.
Sources read: `MEMORY.md` row G, `.digismith/history.html`, `.digismith/docs/` (all G folders and `unified-docs-convention`), `backlog/*.md`, `git log`, and all tasks of E.0 to E.4 in ClickUp (`dg clickup list-tasks`, `get-task`).

## Table: sub-items of letter G

| Sub-item | Ship date | Ticket | Docs attached | Target (if missing) |
|---|---|---|---|---|
| G.1 Standards injection (build, final-review fix, polish, `team/` split, live validation, 2026-08-06) | 2026-08-06 | DGS-192 (E.1) | yes (3) | - |
| G.2 Toolchain (`toolchain.yml`, `digismith:toolchain`; first built as letter U) | 2026-09-11 | DGS-193 (E.2) | yes (3) | - |
| G.2 Merge U into G, rename G to Methodology | 2026-09-11 | DGS-194 (E.2) | yes (6) | - |
| G.3 Dynamic Doc Conventions | 2026-09-23 | DGS-195 (E.3) | yes (3) | - |
| G.1 follow-up: global git/PR standards (`branch-scope-discipline`, `code-comments`, `commit-style`, `fixing-blockers-mid-task`, `pr-descriptions`), `team/commit-style` retired (`aa08090`) | 2026-08-14 | MISSING | no docs exist | E.1 (borderline, see below) |
| G.1 follow-up: `surgical-changes` global standard (`d581c5a`) | 2026-08-14 | MISSING | no docs exist | E.1 (borderline, see below) |

All four G items that have docs, a map entry and a "Shipped" line have a ticket. No full-size sub-item of letter G is missing.

## Borderline items (not counted as missing, except the first two for Jack's call)

1. G.1 follow-up, 2026-08-14 `aa08090` and `d581c5a`: two commits that add six standards files. Shipped under G.1 in spirit, but never named in the map, no design/plan/report, not in `history.html`. A "G.1 follow-up: global standards" ticket in E.1, ship date 2026-08-14, with no docs, would cover them. Your call: Jack may see them as content, not a build.
2. G.1 final-review fix and polish (2026-08-06): same day, same branch as DGS-192, in its report. Covered by DGS-192. No ticket needed.
3. `unified-docs-convention` (2026-08-08, no map letter, docs exist): shipped with no letter. It is not letter G. Its home is E.3 (Conventions), and it belongs to letter Q's old life (convention enforcement). Check whether the Q migration ticket takes it. If not, E.3, ship date 2026-08-08, 3 docs.
4. G.3.1 ASD-STE100 (2026-09-12), G.3.2 to G.3.6, T.1 to T.5 voice standards, Voice Gate (2026-09-22): promoted out of G into letter T on 2026-09-13. They belong to the T migration, not here.
5. `inject-standards-prose-scope-gate` (2026-09-13, docs: design and plan, no report): shipped as a T fix, not G. Leave to the T migration.
6. G.2.1 Diagramming tool integration: raw idea, never built (`backlog/diagramming-tool-integration-g21.md`). Not a historical ticket.
7. `toolchain-general-trigger-scope`: deferred, never built. Backlog, DGS-165 converts it.
8. `review-time-standards-injection-gap`: folded into W.8 (`activate-requesting-code-review-w8`), never built. Not G.
9. `inject-standards-category-scoped-injection`: raw idea from T.2 brainstorm (2026-09-23), never built. Not G.
10. `docs-convention-letter-nesting` and `opinionated-tech-stack-defaults`: the backlog sources of DGS-195 and DGS-193. Covered.
11. `rename-g-methodology` and `structure-merge-g-and-u` docs: covered by DGS-194 (the 6 files).
12. `fix(vps-session)` nvm toolchain check (2026-09-11, `c12feb6`): X, not G.

## Check of the 4 existing tickets

| Ticket | Right list | Ship date (start = due, 04:00 UTC+7) | Docs attached |
|---|---|---|---|
| DGS-192 Standards injection (G.1) | E.1 yes | 2026-08-06, matches the report commit `0718301` | design.html, plan.md, report.html |
| DGS-193 Toolchain defaults (G.2) | E.2 yes | 2026-09-11, matches `e284a83` | design.html, plan.md, report.html |
| DGS-194 Merge U into G and rename (G.2) | E.2 yes | 2026-09-11, matches `c85904e` and `0face1c` | 6 files (two sets, both folders) |
| DGS-195 Dynamic Doc Conventions (G.3) | E.3 yes | 2026-09-23, matches `ac4d354` | design.html, plan.md, report.html |

All four are `done`. Notes:
- DGS-192 docs folder `standards-injection` is dated 2026-08-08 in git only because a move commit touched it. The real report commit is 2026-08-06. The ticket date is right.
- DGS-195 started 2026-09-19 (design) and shipped 2026-09-23. The ticket uses the ship date. Right.
- DGS-194 has two files of each name, no way to tell which folder each came from (already noted by the first worker). Optional: rename on a later pass.
- DGS-156 (E.0), E.3 (DGS-158, 159, 164, 165, 166) and E.4 tickets read only, not touched. None of them is a historical letter G item.

## Totals

- Sub-items with a ticket: 4 of 4 full items.
- Missing: 0 full items, 2 borderline (G.1 follow-up standards, 2026-08-14, E.1, no docs), plus 1 to confirm with the Q migration (`unified-docs-convention`, E.3).
- Confidence: high (about 90%) on the 4 existing tickets and on 0 missing full items. Medium (about 70%) on the borderline calls, since they are Jack's judgment on what counts as a ticket.
