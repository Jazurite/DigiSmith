# DGS-186 plan: clan F Scripture, checkpoint 1 (design)

Written 2026-10-10 (UTC+7). Read-only. No ClickUp write, no git change. Waiting for "approved: checkpoint 1".
Sources read: `MEMORY.md` frozen map, `.digismith/history.html`, `.digismith/docs/`, `backlog/*.md`, git log, ClickUp lists (read only).
Say "letter" for the old map and "clan" for ClickUp.

## 1. Inventory by letter

Dates are UTC+7 ship dates from `history.html` and the first git commit.
"A:" = the A.1 skill ticket the F stage ticket links to. DGS-210, 211 and 212 exist. Every "new" one is a new done ticket in A.1.
No A.1 ticket exists yet for capture-ephemeral-url, report-implementation, jira-progress-write-back, teams-pr-review-notification or generate-comment.

### Letter A, Intake/creation (DGS-26, merged)
| Sub-item | Date | Docs and git | Skill ticket |
|---|---|---|---|
| A: `jira-intake`, two doors (ticket exists, raw need) | spec 2026-08-06, built 2026-08-07 (`ae33b9d`) | `docs/jira-intake/design.html`, `plan.md`; `skills/jira-intake` | A: DGS-210 (done) |
| A reprioritized ahead of E | 2026-08-06 | history entry only, not a ticket | none |
| Board path for keyed tickets (DGS-159 Part 3) | 2026-10-04 | history entry; belongs to the naming rearchitecture (DGS-158/159) | none, already tracked |
Open backlog of letter A: `jira-intake-market-repo-selection.md` (2026-09-29, no ClickUp key), `init-amend-initialized-ticket.md` (2026-10-02, no key).
Retired meaning: none.

### Letter F, Design review (DGS-31, merged)
Never built. MEMORY row: "independent critique of a design, then the jade-and-ink artifact rendering". History: no entry.
Open: `design-review-shape.md` = DGS-167 (E.4, backlog). Review pipeline tickets in B (DGS-127 Sol process, DGS-129 Sol in SDD, DGS-130 many reviewers, DGS-78 cross-model review) are about the review stage too. DGS-171 (Reviewer role) is O.3.
Retired meaning: none.

### Letter I, Reporting (DGS-34, merged)
| Sub-item | Date | Docs and git | Skill ticket |
|---|---|---|---|
| I.1 JIRA progress write-back, ADF lozenges | 2026-08-26 (`b18f99d`) | `docs/jira-progress-write-back/` design, plan, report | A: new |
| I.1 migration off the Atlassian MCP connector to direct REST (`packages/jira-client`) | 2026-08-27 | `docs/jira-rest-migration/` design, plan, report | package, clan D (see question 4) |
| I.4 Teams review-request message | 2026-09-09 (`f8320f1`); reworked on Q.1 on 2026-09-10 | `docs/teams-pr-review-notification/` design, plan, report | A: new |
| I.5 jira-client Windows entry-guard fix | 2026-09-18 | `docs/jira-client-windows-entrypoint-fix/` design, plan, report | package, clan D |
| I.6 jira-client attachment upload | 2026-09-19 | `docs/jira-client-attachment-upload/` design, plan, report | package, clan D |
| I.2 multi-repo distribution | not built | `backlog/jira-write-back-adf-reporting.md` (no key) | none |
| I.3 reusable comment templates | became letter Q on 2026-09-09 | see Q | none |
Open backlog: DGS-21 ClickUp write-back (D.3), DGS-79 move ticket status with work progress (D.3), DGS-178 maestro posts ClickUp comments (Imperium subtask), `rename-progress-update-to-technical-update.md`, `richtext-to-adf.md`, `jira-comment-autolink-ticket-keys.md` (all 2026-10-02, no keys).
Retired meaning: "QA handoff" label, renamed Reporting 2026-09-08 (I.2 and I.3 old meanings moved to letters R and S on 2026-08-26). Not mapped.

### Letter J, Estimation (DGS-35, merged)
Never built. MEMORY row only: "dual-track: internal number and client number". No history entry, no docs, no backlog file, no ticket.

### Letter L, Refinement and exploration (DGS-37, merged)
Never built. L.1 connect a ticket to the feature network, L.2 source the codebase and return the code list. No history, docs or ticket.
The 2026-08-06 history entry settled that L stays separate from A.

### Letter M, Ephemeral deploy capture (DGS-38, merged)
| Sub-item | Date | Docs and git | Skill ticket |
|---|---|---|---|
| M: `capture-ephemeral-url`, poll the Emma PR check, extract Preview and Theme Editor URLs | split and specced 2026-08-08, built 2026-08-08 (`2839cce`) | `docs/capture-ephemeral-url/` design, plan, report | A: new |
Open backlog: `capture-ephemeral-url-rest-comment-fetch.md` (no key).

### Letter N, Implementation reporting (DGS-39, merged)
| Sub-item | Date | Docs and git | Skill ticket |
|---|---|---|---|
| N: `report-implementation`, HTML report before the SDD ledger is deleted | built 2026-08-08 (`058e474`) | `docs/report-implementation/` design, plan, report | A: new |
| executing-plans ledger so inline plans get a report | 2026-09-04 (W.6, DGS-209 in A.1, done) | covered by DGS-209 | A: DGS-209 |
Open backlog: `report-implementation-non-ff-merge-range.md`, `report-implementation-ordering-not-enforced.md` (no keys).

### Letter Q, Templating (DGS-42, open, waits for F)
| Sub-item | Date | Docs and git | Skill ticket |
|---|---|---|---|
| Q.1 `generate-comment` with 3 templates, plus Q.2 rework of I.1 and I.4 onto it | 2026-09-10 (`161546a`) | `docs/generate-comment/` design, plan, report | A: new |
| Q.1 addendum: Screenshots / Videos section | 2026-09-18 | `generate-comment/plan-screenshots-section.md`, `report-screenshots-section.html` | folds into the Q.1 ticket |
| T.2 wires generate-comment to the ASD-STE100 standard | 2026-09-23 | letter T, clan E | not F |
Retired meaning: Convention enforcement (2026-08-15 to 2026-09-04, `digismith:enforcer`). A only: DGS-207 and DGS-208 are already done in A.1. No F ticket.

## 2. Lineages to create now (draft trimmed)
Rule from P: no empty lists. Create a list only when a ticket lands in it today.

| List | One line | Gets today |
|---|---|---|
| F.0 Pavilion | Tracker support list, adapter contract, and anything across lineages | DGS-186, DGS-189 |
| F.2 Intake | Ticket text in: the intake stage | jira-intake stage ticket |
| F.5 Review and verification | Review of a design and of built work | DGS-167 and Jack's pick of review tickets |
| F.6 Integrate and finish | Merge, pull request, deploy-URL capture | ephemeral capture stage ticket |
| F.7 Report and sync | Reports and write-back to the tracker | N, I, Q stage tickets |
Not created now (no ticket yet): F.1 Research (L has nothing built), F.3 Design and planning, F.4 Build. Their skills are vendored primitives, already A.1 tickets (DGS-51 to DGS-54, DGS-208, DGS-209).
Lineage numbers stay as in the draft, so F.3 and F.4 are skipped on purpose (same as A.2).

## 3. Stage tickets to create (status `done`, start = due = ship date, docs attached)
| # | Lineage | Name | Ship date | Docs | A ticket |
|---|---|---|---|---|---|
| 1 | F.2 | Ticket intake: two doors, ticket or raw need (A) | 2026-08-07 | jira-intake design, plan | DGS-210 |
| 2 | F.6 | Ephemeral deploy URL capture from the PR (M) | 2026-08-08 | capture-ephemeral-url design, plan, report | new A.1 |
| 3 | F.7 | Implementation report before the plan is deleted (N) | 2026-08-08 | report-implementation design, plan, report | new A.1; DGS-209 |
| 4 | F.7 | JIRA progress write-back with real ADF (I.1) | 2026-08-26 | jira-progress-write-back design, plan, report | new A.1 |
| 5 | F.7 | JIRA write-back moves to direct REST (I.1) | 2026-08-27 | jira-rest-migration design, plan, report | package ticket in D |
| 6 | F.7 | Teams review-request message (I.4) | 2026-09-09 | teams-pr-review-notification design, plan, report | new A.1 |
| 7 | F.7 | Comment templates: generate-comment (Q.1, Q.2, Screenshots addendum) | 2026-09-10 | generate-comment design, plan, report, addendum files | new A.1 |
Recommended: merge nothing else. Each is one build with its own report.
Package tickets (D, done): jira-client Windows entry guard (I.5, 2026-09-18) and attachment upload (I.6, 2026-09-19). No F ticket for these; the F ticket 4 and 5 text names them.
New A.1 tickets: capture-ephemeral-url, report-implementation, jira-progress-write-back, teams-pr-review-notification, generate-comment (5).
Each F ticket names its A ticket in the description, and the A ticket names the F one, until DGS-219 lets `dg` link them.

## 4. Moves into F as is (list for Jack)
| Ticket | From | Proposed list | Note |
|---|---|---|---|
| DGS-186 | Imperium | F.0 | this clan's own ticket (done by the maestro on Jack's yes, after the move) |
| DGS-189 supported-trackers catalog | Imperium | F.0 | the F.0 purpose |
| DGS-167 design review shape | E.4 | F.5 | letter F's open question |
| DGS-127, 129, 130, 78 review pipeline (Sol) | B Pavilion list | F.5? | Jack's call; they are agent mechanics too |
| DGS-21 ClickUp write-back | D.3 | F.7? | stage behavior, but D.3 is the dg tool lineage |
| DGS-79 move status with progress | D.3 | F.7? | same |
| DGS-178 maestro posts ClickUp progress | Imperium (subtask) | stays? | subtask of DGS-159; maestro behavior |
| DGS-213 ClickUp Synchronization | Imperium | stays | epic; spans clans |
| DGS-42 Q Templating | Imperium | closed by this work? | waits for F |
Stay where they are: DGS-171 (O.3 Roles), DGS-172/173 (E.4), DGS-187 (Imperium, history out of scope).
Backlog files with no ClickUp key (9): market repo selection, init amend, REST comment fetch, two N gaps, I.2 multi-repo, technical-update rename, richtext-to-adf, autolink keys. Auto-create rule applies to a new backlog item; for old ones it is Jack's yes.

## 5. Questions for Jack (one at a time)
1. Lineages: create the five above only, or all eight of the draft?
2. Letters J (Estimation) and L (Refinement and exploration): one backlog ticket each, or none (they never shipped)?
3. Review pipeline tickets (DGS-127, 129, 130, 78) and DGS-21, DGS-79: move to F, or leave?
4. Where do the three jira-client package tickets go (D.2 CLI and Packaging?) and are they in this job?
5. The 9 old backlog files without a key: make tickets now, or leave for later?
