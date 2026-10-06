# Scripture: the clan for DigiSmith's software development lifecycle

**Status:** Idea, Jack's call (2026-10-06 UTC+7). Definition only: no ClickUp clan, folder or list exists yet. Letter: **F**, the next after E (Jack, 2026-10-06). ClickUp: **DGS-186**
(Town Hall, like DGS-152, task id `14zcebrv03m`, created 2026-10-06 UTC+7).

**Source:** Jack, 2026-10-06, while backfilling the clans (DGS-25). He wanted a clan for "the integration of the ticket text and then reporting
to the ticket tracker", then widened it: "this will be our actual software development lifecycle". After weighing SDLC, Pipeline, Ticket Flow and
Tracker Integration, he chose **Scripture** as the clan's name, an alternative name for the software development lifecycle. "Pipeline" is kept
free for a future DevOps clan (CI/CD pipelines).

## Vocabulary (Jack, 2026-10-06)

A **letter** is a legacy map letter (the old A to Z in `MEMORY.md` and `history.html`, such as "letter E, the spine"). A **clan** is a clan in
ClickUp (A: System, B: Agentic, C: Platform, D: Depot, E: Methodology, and this one, F: Scripture). The same character can name both, so say which.
Letters B, C and D are parked in a future placeholder clan to be distributed later. Letter E (the spine: `init`, `adopt`, stage-order enforcement)
goes to clan A: System. Letters A, F, I, J, L, M and N fold into clan F: Scripture.

## What Scripture is

The path a ticket travels from first text to reported delivery, with research as its first step, and the written record that path leaves behind.
It also defines which ticket trackers DigiSmith supports (Jira and ClickUp now; any other by implementing the same contract) and how a repo's
profile (clan O: Profiling) picks one. It is not CI/CD: building, testing and shipping merged work is DevOps, a later clan.

## Draft lineages (not decided)

- **.0 Pavilion:** the tracker support list and the adapter contract (read a ticket, create one, change status, comment, attach files), and anything
  that spans lineages.
- **.1 Research:** spikes, scouting and investigations (old map letter L, Refinement & exploration; the Scout role, DGS-171).
- **.2 Intake:** ticket text in (`jira-intake`, `init`), refinement and estimation (old A, J, L).
- **.3 Design and planning:** `brainstorming`, spec, `writing-plans`.
- **.4 Build:** `subagent-driven-development`, `executing-plans`, the offload runners, TDD.
- **.5 Review and verification:** `requesting-code-review`, the Sol reviewer, `verification-before-completion`, and design review (old F, DGS-31 and DGS-167).
- **.6 Integrate and finish:** `finishing-a-development-branch`, the pull request, the deploy-URL capture (old M).
- **.7 Report and sync:** `report-implementation`, write-back to the tracker (old I and N, DGS-178). `history.html` is out of scope (see `living-history.md`, DGS-187).

## Boundaries

- **E: Methodology** holds the rules for how we work (standards, conventions, E.4 Workflows). Scripture is the stages a ticket moves through.
  DGS-172 and DGS-173 (define and document the project workflow) describe this lifecycle: candidates to move to the Scripture Pavilion.
- **DevOps** (future) owns CI/CD pipelines and deploy mechanics. Scripture keeps only the report back to the ticket.
- **A.3 Lifecycle Hooks** stays in A: System. Hooks are session mechanics, not the lifecycle stages.
- **O: Profiling** keeps the profile. Scripture reads the tracker choice from it.

## Merged backfill tickets and the inventory they leave

Jack closed these Clan Backfill subtasks on 2026-10-06 UTC+7, merged into this ticket (each kept its original description under a "merged into
DGS-186" note; none was deleted, so any of them can be reopened): DGS-26 (A Intake/creation), DGS-31 (F Design review), DGS-34 (I Reporting),
DGS-35 (J Estimation), DGS-37 (L Refinement & exploration), DGS-38 (M Ephemeral deploy capture), DGS-39 (N Implementation reporting). B, C, D and E
(DGS-27 to DGS-30) were not closed: their mapping is still undecided.

The closed tickets do not list their sub-items, so **the first step of the design is an inventory**. For each merged letter, list every historical
sub-item from `.digismith/history.html` (the entry and its date), `.digismith/docs/<letter>/` (design, plan, report), the `backlog/*.md` files
and git history. The result is the list of tickets to create in the F lineages, each with its real ship date and docs attached. Do not create any
ticket before Jack has seen that list.

## Open questions

1. The letter is decided: **F: Scripture**. The old map letter F was Design review (DGS-31, DGS-167): it becomes part of .5 Review and verification, so DGS-31 maps here instead of getting its own migration.
2. Which old letters merge in: A, I, J, L, M, N, and maybe C (Live work journal) and the old D (Delivery).
3. Decided 2026-10-06: `history.html` stays out of this clan until the living-history concept (DGS-187) is settled.
4. Whether DGS-172 and DGS-173 move into the Pavilion.

## Related

DGS-25 (Clan Backfill) and its subtasks DGS-26, DGS-34, DGS-35, DGS-37, DGS-38, DGS-39, DGS-152 (Platform clan), DGS-171 (Scout, Reviewer, Jack),
DGS-172, DGS-173, DGS-178, `platform-clan.md`, `autonomous-agentic-architecture.md`.
