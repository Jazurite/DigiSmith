# Imperium: the roadmap list, and every normal ticket back to its clan

**Status:** Decided, Jack (2026-10-10 UTC+7). The list is renamed and described; the rest is to do. ClickUp: **DGS-215** (list E.3: Conventions, created 2026-10-10 11:55 UTC+7 [04:55Z], task id `14zcebrvck7`).

**Source:** the DGS-213 talk on epics, initiatives and milestones, 2026-10-10. Jack: "the town hall is where we place all our big initiative,
epic and milestone, while the normal ticket lives and distributes to each clan", then "we should not call it Town Hall. I think the word
Imperium is more suitable."

## The rule (Jack, 2026-10-10)

- **Imperium** (ClickUp list `1301150000002179`, renamed from Town Hall on 2026-10-10) is the roadmap. It holds initiatives, epics and
  milestones only.
- **Normal tickets** live in their clan's lineage list. A clan's Pavilion list takes what spans that clan's lineages.
- **Initiative:** a group of epics for one goal; its epics are its subtasks (both live in Imperium, so a subtask is fine).
- **Epic:** a body of work with an end. Its tickets stay in their clan lists and link to it (option B, the Master's recommendation; Jack can
  still pick option A, subtasks with the "Subtasks in Multiple Lists" ClickApp).
- **Milestone:** a dated checkpoint, ClickUp's Milestone type. Its description says "done when"; the tickets that must finish first block it.
- Industry order: initiative > epic > ticket > subtask. A milestone is a point in time, not a container.
- **Concepts with no clan yet are parked in Imperium as `backlog` (Jack, 2026-10-10).** A concept has no letter in its name and no
  lineage until Jack places it: DGS-43 "End-to-end testing" and DGS-44 "Figma visual regression" (were letters R and S of DGS-25).
- **A ticket that belongs to two clans becomes two tickets (Jack, 2026-10-10).** Each one covers only its own clan's or lineage's part,
  and the two link to each other. An epic or initiative may span clans. Example: DGS-214 (the token counter) stays in B.3: Token Economics;
  the analysis of its counts is a separate clan G ticket that links to it (DGS-220, the data collection epic, spans both). The A/F rule
  for skills is the same pattern. Until `dg` has a link command (DGS-219), each ticket names the other in its description.

The list description in ClickUp says the same (set 2026-10-10).

## To do

1. **Done 2026-10-10 16:31 UTC+7, through `dg` (DGS-217 set):** task types **Epic** (id 1020, icon bolt) and **Initiative** (id 1021,
   icon flag) exist; DGS-25, DGS-182 and DGS-213 are Epic. The plan has no limit on typed tasks. DGS-182 is still in C.1: Workbox, not
   in Imperium (to decide with step 4).
2. **Test on a throwaway ticket:** a link from a ticket in a clan list to an epic in Imperium, and whether a Rollup column shows the epic's
   progress. Archive the throwaway after, never hard-delete it.
3. **`dg clickup` additions (D.3: ClickUp Channel):** DGS-217 create-task-type and DGS-218 list-task-types and `--type` shipped
   2026-10-10 (with DGS-221, DGS-222); DGS-219 dependency and link commands (public API) is still backlog. Only for option A:
   add a task to another list (no ticket yet).
4. **Distribute the normal tickets in Imperium** to their clans, with a plan Jack approves first (`dg clickup move-task`). On 2026-10-10:
   DGS-13, 68, 82 (with its subtask DGS-87), 115, 118, 125, 126, 146, 148, 149, 152, 186, 187, 188, 189. Some may be epics instead (DGS-68
   "Integrate ClickUp into DigiSmith's workflow" overlaps DGS-213; DGS-82 has a subtask). DGS-149 is a duplicate kept for reuse, not
   archived (Jack).
5. **DGS-178** goes back to E.4 with a link to DGS-213 when option B is confirmed (the parent move put it in Imperium).
6. **DGS-25's 24 letter subtasks** (DGS-26 to DGS-49): keep them as subtasks of the epic, or link them. Jack decides.

## Related

DGS-213 (ClickUp Synchronization, the first epic made under this rule), DGS-25, DGS-182, DGS-197 (`--parent`), DGS-152 (C clan migration),
`clickup-synchronization.md`, `clickup-parent-flag.md`.
