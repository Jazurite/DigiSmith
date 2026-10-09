# DGS-25 verify: letters A to E (Scout report, read-only)

Written 2026-10-07 by `dgs-25-verify`. Sources: `MEMORY.md` (frozen map), `.digismith/history.html`, `.digismith/docs/`, `backlog/*.md`,
and ClickUp (all 185 tasks in all lists of space 1301150000001271, plus `get-task` on DGS-25 to DGS-30, DGS-47, DGS-48, DGS-186, DGS-188).
Nothing was written to ClickUp or to the repo (except this file).

## Short answer
Only 3 historical sub-items were ever shipped in letters A to E: A (jira-intake), E.1 and E.1-amend. **All 3 are MISSING as tickets.**
Letters B, C and D were never built, so they have no historical sub-items to ticket. E.2 (not started) has no ticket either, but it is an open idea, not history.

## Important finding: the ClickUp "clan" letters are not the old "letters"
The Scout order says "letter A to clan A: System, B to clan B: Agentic, D to clan D: Depot". That mapping is wrong, and the ClickUp data says so:
- Clan A: System holds old letters W and Y (DGS-47, DGS-49). Clan B: Agentic holds old K, X, Z (DGS-48). Clan D: Depot holds old V. None of them holds old A to E.
- The real destination of old A to E (DGS-26 to DGS-30 notes, `backlog/scripture-clan.md`, `backlog/distribute-parked-letters.md`):
  - Letter A: merged into DGS-186 (clan F: Scripture), closed 2026-10-06. Clan F does not exist yet (no folder or list).
  - Letters B, C, D: merged into DGS-188, to go to a placeholder clan, not created yet.
  - Letter E: goes to clan A: System, lineage not chosen (probably A.0 Pavilion for E.2). No ticket made.
- So DGS-26 to DGS-30 show `done` only because Jack closed them as "merged". Their notes say "gets no migration of its own". None has subtasks, attachments or a created ticket behind it.
- ClickUp has no ticket at all for jira-intake, init, adopt, using-digismith, spec seam, journal or delivery (name search over all 185 tasks).
- Small inconsistency: `scripture-clan.md` says DGS-27 to DGS-30 "were not closed"; ClickUp shows them `done` with a "merged into DGS-188" note.

## Letter A: Intake/creation (DGS-26, closed, merged into DGS-186)
| Sub-item | Ship date (history) | Ticket | Docs attached |
|---|---|---|---|
| A: `jira-intake` skill, two-door intake | spec 2026-08-06, built and closed 2026-08-07 | MISSING | no (docs exist: `.digismith/docs/jira-intake/` design.html, plan.md; no report.html) |

## Letter B: Spec seam (DGS-27, closed, merged into DGS-188)
| Sub-item | Ship date (history) | Ticket | Docs attached |
|---|---|---|---|
| none: letter never built ("Not started" in history; no design, plan or backlog file) | n/a | no ticket needed for history; letter-level idea only in DGS-27/DGS-188 | n/a |

Note: `.digismith/docs/B/sol-review-process/` belongs to clan B: Agentic, not to old letter B. Do not attach it here.

## Letter C: Live work journal (DGS-28, closed, merged into DGS-188)
| Sub-item | Ship date (history) | Ticket | Docs attached |
|---|---|---|---|
| none: letter never built ("Not started"; intent only in `MEMORY.md`) | n/a | no ticket needed for history; letter-level idea only in DGS-28/DGS-188 | n/a |

## Letter D: Delivery (DGS-29, closed, merged into DGS-188)
| Sub-item | Ship date (history) | Ticket | Docs attached |
|---|---|---|---|
| none: letter never built ("Not started") | n/a | no ticket needed for history; letter-level idea only in DGS-29/DGS-188 | n/a |

Note: `.digismith/docs/D/D.3/` belongs to clan D: Depot (D.3 ClickUp Channel), not to old letter D.

## Letter E: The spine (DGS-30, closed, merged into DGS-188)
| Sub-item | Ship date (history) | Ticket | Docs attached |
|---|---|---|---|
| E.1: `using-digismith` (now `bootstrap`), first slice | 2026-08-07 | MISSING | no (docs exist: `.digismith/docs/using-digismith/` design.html, plan.md; no report.html) |
| E.1-amend: `digismith:init` + `digismith:adopt` unified entry | 2026-08-16 | MISSING | no (docs exist: `.digismith/docs/digismith-init/` design.html, plan.md, report.html) |
| E.2: full stage-order enforcement | not shipped ("Not started") | MISSING (open idea, no ticket, no docs) | n/a |

Note: `.digismith/docs/E/E.3/` and `E/E.4/` belong to clan E: Methodology, not to old letter E.

## Totals
- Shipped historical sub-items: 3 (A, E.1, E.1-amend). Ticketed: 0. **Missing: 3.**
- Unshipped sub-item with no ticket: 1 (E.2). Letter-level placeholders for B, C, D (never built): 3, covered only by DGS-27 to DGS-29 and DGS-188.
- Docs available to attach once the tickets exist: 7 files (jira-intake 2, using-digismith 2, digismith-init 3).
- Related shipped work not in these letters (not counted): E.1-amend follow-ups in `backlog/` (`init-amend-initialized-ticket`, `jira-intake-market-repo-selection`) are open ideas, not shipped. The DGS-159 history entry touches `init`/`jira-intake` skills but belongs to the ticket-naming work.

## Confidence
High (about 90%) for the count of 3 missing: letter rows, history events and docs folders agree, and the ClickUp name search found no match.
Lower (about 70%) on completeness of ship dates for A: history gives 2026-08-06 (spec) and 2026-08-07 (built, closed); I did not check git log. Dates are calendar dates only (no time of day in the history).
