# Define the Maestro role: the project's head butler

**Status:** Idea, split out of DGS-170 by Jack (2026-10-04 11:40 UTC+7 [04:40Z]): "Decouple the maestro change to another ticket. 170 fully
focus on the Master role." No design yet. ClickUp: **DGS-176** (list O.3: Roles, created 2026-10-04 11:40 UTC+7 [04:40Z], task id `14zcebruqu3`).
**Blocked by DGS-172** (what a project is, and the project workflow). **It blocks DGS-169** (the maestro in herdr).

**Source:** Jack's exploration of a persistent maestro (DGS-169, `backlog/maestro-in-herdr.md`) and the role discussion in DGS-170. The
maestro is the part that changes: where it lives, how many there are, how it is reset, what state it holds.

## Decided (Jack, 2026-10-04)

- **Maestro: the highest rank of servant, a butler.** The head butler of a project. The household reads: the Master (the user, DGS-170),
  then the Maestro, then the workers (the servants). "Butler" is the picture, not a second name.
- **One maestro per project.** Not one for the whole system ("a mess"), not one per client or repo. It needs a definition of "project"
  (DGS-172). The Master decides which projects get a maestro (DGS-170).
- **The maestro holds all the state.** The Master uses only a client to give orders (the Master's client, DGS-174) or an Observer to watch
  (DGS-175), never a worker directly.
- **No kicker.** "We will not keep the kicker, because now we still need a kicker to reset the maestro session." The kicker is the
  workaround for a Desktop maestro that cannot be reset from outside.
- **A requirement for this design:** the state kept in one structured place that a client can read (a state file: the roster, the open
  questions for the Master, a decision log with a reason each, the next steps), not only in prose notes.
- **Out of scope:** the maestro's review steps ("another ticket", Jack). The Scout, the Reviewer and what the Master decides are DGS-171.

## To define

- **Its job** in one sentence, and what is never its job. Today it decides, orders workers, answers their prompts at checkpoints, keeps the
  notes (runbook, backlog, memory), and does not do the work (DGS-146, "just give out orders"). Does any of that change?
- **What it reports to the Master, and when,** and what it may decide alone.
- **Its lifetime.** Does it end when its project ends, like a worker (a flux that closes it)?
- **Its state:** what it holds, where (the state file, its note, the runbook, ClickUp as the source of truth), and who may read it.

## Questions to settle first

- **Many maestros, one set of resources.** A ticket has at most one maestro. Two maestros must not brief a worker for the same ticket or
  fight over the account matrix, the free memory, or the runbook. Who holds the registry: the herdr session, the runbook, or ClickUp?
- **The three maestros we have.** `DigiSmith`, `Emma` and `Soveron` (one per project, each with a herdr session of the same name) stay
  until the new design lands. What do they become?
- **Where it lives:** a herdr pane, an OpenCode server (`opencode serve` on localhost, reached by an SSH tunnel), a Desktop session.
- **How it is resumed and renewed with no kicker.** The Flux protocol (DGS-154) was written for a Desktop maestro; its rule 6 and the
  "Maestro flux" (M1 to M7) are reopened.
- **Which seat or model it uses** (fixed on `dev0` today; a TokenReply model spends no seat quota).

## Output

A design in the ticket's board folder: the Maestro role with a definition, rights and an example, the resume path with no kicker, the state
file, and a recommendation for DGS-169's shape (herdr agent, OpenCode server, or both). Brainstormed with Jack, since the design questions
are his. A worker may run the sessions (`digismith:brainstorming`), the maestro answers the routine ones.

## Log of Jack's statements (kept for the record)

- 2026-10-04 11:2x: no kicker; the maestro count should not be per client or repo; then "one maestro for a project"; then each project has one
  maestro, "a butler to manage our project for the end user", who "holds all the information, the state".
- 11:5x: "Master: represent the user. Maestro: represent the highest rank of servant, a butler."
- Then: "Decouple the maestro change to another ticket. 170 fully focus on the Master role."

## Related

[brainstorm-the-new-maestro-role.md](brainstorm-the-new-maestro-role.md) (DGS-170, the Master role), [maestro-in-herdr.md](maestro-in-herdr.md)
(DGS-169, blocked by this item), [define-the-observer-role.md](define-the-observer-role.md) (DGS-175),
[build-observer-and-operator-clients.md](build-observer-and-operator-clients.md) (DGS-174),
[define-scout-reviewer-and-jack-roles.md](define-scout-reviewer-and-jack-roles.md) (DGS-171),
[define-project-and-project-workflow.md](define-project-and-project-workflow.md) (DGS-172),
[maestro-delegates-builds-to-workers.md](maestro-delegates-builds-to-workers.md) (DGS-146), [persistent-worker-pool-k8.md](persistent-worker-pool-k8.md),
DGS-154 Flux (rule 6), DGS-156 (methodology vocabulary).
