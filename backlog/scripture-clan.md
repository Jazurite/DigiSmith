# Scripture: the clan for DigiSmith's software development lifecycle

**Status:** Idea, Jack's call (2026-10-06 UTC+7). Definition only: no ClickUp clan, folder or list exists yet. Letter: **F**, the next after E (Jack, 2026-10-06). ClickUp: **DGS-186**
(Town Hall, like DGS-152, task id `14zcebrv03m`, created 2026-10-06 UTC+7).

**Source:** Jack, 2026-10-06, while backfilling the clans (DGS-25). He wanted a clan for "the integration of the ticket text and then reporting
to the ticket tracker", then widened it: "this will be our actual software development lifecycle". After weighing SDLC, Pipeline, Ticket Flow and
Tracker Integration, he chose **Scripture** as the clan's name, an alternative name for the software development lifecycle. "Pipeline" is kept
free for a future DevOps clan (CI/CD pipelines).

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
- **.7 Report and sync:** `report-implementation`, write-back to the tracker (old I and N, DGS-178), and history.

## Boundaries

- **E: Methodology** holds the rules for how we work (standards, conventions, E.4 Workflows). Scripture is the stages a ticket moves through.
  DGS-172 and DGS-173 (define and document the project workflow) describe this lifecycle: candidates to move to the Scripture Pavilion.
- **DevOps** (future) owns CI/CD pipelines and deploy mechanics. Scripture keeps only the report back to the ticket.
- **A.3 Lifecycle Hooks** stays in A: System. Hooks are session mechanics, not the lifecycle stages.
- **O: Profiling** keeps the profile. Scripture reads the tracker choice from it.

## Open questions

1. The letter is decided: **F: Scripture**. The old map letter F was Design review (DGS-31, DGS-167): it becomes part of .5 Review and verification, so DGS-31 maps here instead of getting its own migration.
2. Which old letters merge in: A, I, J, L, M, N, and maybe C (Live work journal) and the old D (Delivery).
3. Whether `history.html` moves into this clan's .7 (Jack: it should migrate into ClickUp).
4. Whether DGS-172 and DGS-173 move into the Pavilion.

## Related

DGS-25 (Clan Backfill) and its subtasks DGS-26, DGS-34, DGS-35, DGS-37, DGS-38, DGS-39, DGS-152 (Platform clan), DGS-171 (Scout, Reviewer, Jack),
DGS-172, DGS-173, DGS-178, `platform-clan.md`, `autonomous-agentic-architecture.md`.
