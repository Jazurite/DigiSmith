# Define the Scout, Reviewer and Jack roles

**Status:** Idea, split out of DGS-170 by Jack (2026-10-04 11:2x UTC+7 [04:2xZ]): "For the Scout, the Reviewer, Jack ... what does Jack
do? Add decouple into another backlog item. This one [DGS-170] focus on Maestro, Observer and Operator." No design yet. ClickUp: **DGS-171** (list O.3: Roles, created 2026-10-04 11:24 UTC+7 [04:24Z], task id `14zcebruqtm`).

**Source:** DGS-170 (the new maestro role). These roles do not block DGS-169 (the maestro in herdr), so they are decoupled from it.

**Note (2026-10-04):** DGS-170 now names the user's role the **Master** (and DGS-176 defines the maestro, the head butler). "Jack" below is the Master: DGS-170
defines who the Master is; this item keeps *what the Master decides and what the maestro may decide alone*.

## Roles to define

- **Scout.** A worker that only reads (Jack, 2026-10-03: "it should be a scout"): surveys ClickUp, searches the repo, reads a pane. It had
  no ticket until now. Define what it may read, what it returns (a report, never a change), and how the maestro briefs it. How it differs
  from a Worker (a ticket, a brief, a branch, a merge).
- **Reviewer.** An independent reader of a design, a plan or a branch (Sol on TokenReply, a Claude subagent, a Scout). Jack, 2026-10-04: the
  maestro's review steps "will be tackled by another ticket". Define the role: who it is, what it reads, what it returns (findings with a
  failing scenario, a verdict). Related tickets: DGS-127 (Sol as the default reviewer) and DGS-167 (design review shape).
- **Jack.** "What does Jack do?" The human. Which decisions only Jack makes (a design approval, a policy answer, a ClickUp write other than
  creating a backlog task, a push to a shared branch?), which the maestro may make alone, and what Jack no longer has to do (the maestro
  now answers routine worker prompts, and creates a ClickUp task for each backlog item). Read the approval guardrail Jack wrote
  (permission rule plus a pre-approved script directory) as input.
- **Worker.** Unchanged (DGS-158: a ticket, a brief, no state). Only restate it next to the others.

## Moved here from DGS-170 (2026-10-04): what the Master decides, and never has to do

DGS-170 settled who the Master is (anyone holding the SSH key, attached to a persistent maestro). The detail of its decisions belongs here:
policy, design approvals, which projects exist, and the ClickUp writes the maestro may not make. What the Master never has to do: answer
routine worker prompts, create a ticket for a backlog item (DGS-163). Still to define: which of the Master's decisions several Masters
share, and whether any Master can approve anything or some approvals need a named Master.

## Open questions

- Is a Scout a worker kind, or a separate role with its own account and quota rules (it spends little)?
- Does the Reviewer run on a different model family by rule, and who verifies its findings (the maestro, today)?
- Which of Jack's decisions are policy, which are taste, and which the maestro could learn to make alone? Jack's own answer is the input.

## Related

[brainstorm-the-new-maestro-role.md](brainstorm-the-new-maestro-role.md) (DGS-170), [maestro-in-herdr.md](maestro-in-herdr.md) (DGS-169),
[maestro-delegates-builds-to-workers.md](maestro-delegates-builds-to-workers.md) (DGS-146), DGS-127, DGS-167, DGS-156.
