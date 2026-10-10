# DGS-25 gap tickets: plan, checkpoint 1

Written 2026-10-10 (UTC+7), amended the same day with the Master's Amendment 1 (tickets 6 to 8, W.9 check). No ClickUp write has been made. Waiting for "approved: checkpoint 1".
Reads only: `MEMORY.md` rows G, Q, W, `git log`, `.digismith/docs/`, and `dg clickup list-tasks` on A.1, E.1 and E.3.
Recipe copied from DGS-192 to DGS-195: name = plain title + map id in brackets, one-sentence description, start = due = ship date (04:00 UTC+7), status `done`, one attachment per doc, read back.

## Tickets I would create (8)

| # | Name | List | Ship date | Attach (from `.digismith/docs/`) |
|---|------|------|-----------|----------------------------------|
| 1 | Global standards: git/PR conventions and surgical changes (G.1 follow-up) | E.1 Standards `1301150000002966` | 2026-08-14 | none (no docs exist) |
| 2 | Unified docs convention | E.3 Conventions `1301150000002969` (Jack picks, see below) | 2026-08-08 | `unified-docs-convention/design.html`, `plan.md`, `report.html` |
| 3 | Enforcer: enforce the unified docs convention (Q, retired) | A.1 Primitives `1301150000002238` | 2026-08-15 | `enforcer/design.html`, `plan.md`, `report.html` |
| 4 | Retire the Enforcer into the vendored primitives (W.5) | A.1 Primitives | 2026-09-04 | `retire-enforcer-vendored-primitives/design.html`, `plan.md` (no report exists) |
| 5 | Retire Subagent-driven always into the vendored primitives (W.6) | A.1 Primitives | 2026-09-04 | `retire-h-vendored-primitives/design.html`, `plan.md`, `report.html` |

| 6 | `jira-intake` skill: two-door ticket intake (old letter A) | A.1 Primitives | 2026-08-07 | `jira-intake/design.html`, `plan.md` (no report exists) |
| 7 | `using-digismith`, now `bootstrap`: first slice of the spine (old letter E.1) | A.1 Primitives | 2026-08-07 | `using-digismith/design.html`, `plan.md` (no report exists) |
| 8 | `digismith:init` and `digismith:adopt`: unified entry point (old letter E.1-amend) | A.1 Primitives | 2026-08-16 | `digismith-init/design.html`, `plan.md`, `report.html` |

Status `done` on all eight. Start = due = the ship date. Tickets 6 to 8 are from Amendment 1 of the Master's order (skills belong to A: System). No F ticket and no F folder; a clan F stage ticket comes later.

Descriptions (one sentence each):
1. Six global standards files (`branch-scope-discipline`, `code-comments`, `commit-style`, `fixing-blockers-mid-task`, `pr-descriptions`, `surgical-changes`) added, `team/commit-style` retired, global standards enabled on personal profiles (`aa08090`, `d581c5a`).
2. One docs folder per ticket, `design.html`, `plan.md` and `report.html` in a fixed place, and `report-implementation` updated to write them (`ea29bcd` to `1546c98`).
3. A standalone `digismith:enforcer` skill that wrapped `brainstorming` and `writing-plans` from outside so they follow the unified docs convention; retired 2026-09-04 by DGS ticket 4.
4. Enforcer's detection, slug and path logic folded into the vendored `brainstorming`, `writing-plans`, `bootstrap` and `adopt`; the `enforcer` skill removed.
5. The "always subagent-driven" override folded into `writing-plans`' Execution Handoff as complexity-based reasoning; `executing-plans` gains a ledger and self-check; `report-implementation` gains an inline-execution template.

6. A `digismith:jira-intake` skill with two doors, an existing JIRA key or a raw need, that shapes a ticket before any build.
7. The first `using-digismith` skill (the spine): from a ticket key it makes the branch and worktree and stops on a key-less start; renamed to the internal-only `bootstrap` on 2026-08-16.
8. A single `digismith:init` entry that checks for an initialized ticket and dispatches to `bootstrap` (fresh start) or the new `adopt` skill (work already begun outside DigiSmith).

### Ship-date evidence
- 6: `ae33b9d` (skill), `ae97b05` (plugin 0.2.0, "jira-intake shipped"), `a9ccf6a` (history), all 2026-08-07. Design 2026-08-06, plan `8d2b4d9` 08-07. Matches the order.
- 7: `ceb587d` (skill) and `163d7a7` (edge-case tests), 2026-08-07. Matches the order.
- 8: `60ac47e` (init), `3a5d5b2` (adopt), `c20c454` (rename to bootstrap), all 2026-08-16. The report `1446ffa` is 2026-08-18; I use 08-16, the build date, as in the order and as DGS-192 used the build date.
- Docs of 6 and 7 show a git date of 2026-08-08 only because commit `f69719a` moved them into `.digismith/docs/`. The real dates are above.
- 1: commits `aa08090` and `d581c5a`, both 2026-08-14.
- 2: report commit `1546c98`, 2026-08-08. The folder was moved on 08-09 (`265370e`); the ship date stays 08-08.
- 3: skill `2309107`, report `bdc9c52`, 2026-08-15. The publish toggle and offload wiring on 08-16 are follow-ups, not the build. Retired 2026-09-04.
- 4: merge `07888d0`, 2026-09-04 20:05 UTC+7. The docs have no report.html; the implementation report was never written.
- 5: report `455a7f2`, 2026-09-04. Final-review fix `89faa5f` is the same day.

## Unified docs convention: E.3 against A.1 (Jack picks)

Case for **E.3 Conventions** (my recommendation):
- E.3 already holds the whole docs-convention line: DGS-195 (Dynamic Doc Conventions, G.3) rewrites exactly this convention, and DGS-158 (ticket-based naming) supersedes both. This ticket is the first link of that chain, so history reads in order in one list.
- It is a rule about where docs live and what format they take. It is not a skill or a vendored primitive, so it does not fit A.1's meaning.
- The Enforcer (ticket 3) is the enforcement half and goes to A.1. Splitting keeps "the rule" in E.3 and "the machinery that applies it" in A.1.

Case for **A.1 Primitives**:
- It changed a skill: `report-implementation` was edited to write the new layout (`659fea5`), and A.1 holds the other skill-level changes.
- It sits next to its own Enforcer (ticket 3) and W.5 (ticket 4), so the unified docs convention, its Enforcer and its retirement would be one thread in one list.
- Weak point: the three docs describe a convention, not a primitive. The A.1 list today is all vendored-skill work (W.1 to W.12, DGS-116).

## Built or not (W.6, W.13, old Q)

| Item | Built? | Evidence | Result |
|---|---|---|---|
| Old Q `digismith:enforcer` | Yes, 2026-08-15, retired 2026-09-04 | `2309107` (skill), `070422e` (wired into using-digismith), `bdc9c52` report, `docs/enforcer/` has 3 docs; `MEMORY.md` row 2: "Q built 2026-08-15, retired 2026-09-04" | Ticket 3, A.1 |
| W.5 Retire the Enforcer | Yes, 2026-09-04 | `5aa4749`, `04ae808`, `1bb0552`, `c1b951d`, `0c80982`, merge `07888d0`; `docs/retire-enforcer-vendored-primitives/` (design, plan) | Ticket 4, A.1 |
| W.6 Retire H | Yes, 2026-09-04 | `733bd4e`, `89faa5f`, report `455a7f2`; `docs/retire-h-vendored-primitives/` has 3 docs | Ticket 5, A.1 |
| W.13 superpowers-path move | Yes, 2026-09-26, **already ticketed as DGS-77** (A.1, `done`) | `891ba7d` records W.13 with "ClickUp DGS-77"; docs sit in `docs/W/W.3-move-vendored-skills-superpowers-paths/` (design, plan, report) | **No new ticket.** See question 2 |

| W.9 `requesting-code-review` with standards injection | **No.** Idea only, brainstormed and deferred 2026-09-11 | `backlog/activate-requesting-code-review-w9.md` ("Status: Not applied"); `MEMORY.md` W row has no W.9 entry; no ClickUp ticket in A.1 (name search for W.9 and code review: none). The activation that did ship is W.8 (`115b694`, DGS-63) | Named and skipped. It is a backlog item; DGS-165 converts those to tickets |

Not built, skipped: W.9 only. Old Q, W.5, W.6 and W.13 all shipped.

## Questions for Jack
1. E.3 or A.1 for the unified docs convention? I recommend E.3.
2. DGS-77 (W.13) has no start or due date and shows no attachment on its list row. Do you want me to set start = due = 2026-09-26 and attach its three docs? It would be a ClickUp write on an existing ticket, so I do nothing until you say yes. Default: leave it alone.
3. Ticket 4 has only design and plan (no report exists). Fine to create it that way?
4. Tickets 6 and 7 have no report.html (design and plan only). Fine?
5. The Enforcer ticket (3) is an old Q. Fine to name it "(Q, retired)", or do you want it as "(Q)" only?

## Not in this plan
- No Templating (Q.1, Q.2) ticket, no clan F folder.
- W.9 (not built, see table). W.10 I did not check; it is outside the order.
- The verify report's other findings: E.2 full stage-order enforcement was never shipped (open idea), and B, C, D were never built. No tickets for those.
- Status of DGS-25, DGS-32, DGS-42, DGS-47: untouched.

## After approval
Create 8 tickets (or fewer, per your answers; plus the DGS-77 edit if you say yes), set `done`, set start and due dates, upload one file per doc, read each ticket back, write `report.html` next to this file. Stop and report.
