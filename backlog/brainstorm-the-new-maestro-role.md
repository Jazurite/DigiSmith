# Define the Master and Maestro roles (before the maestro moves to herdr)

**Status:** Idea, Jack's call (2026-10-04 11:2x UTC+7): "we need another backlog item to brainstorm the new role, which must be done before
this" (before DGS-169, the maestro in herdr). Roles named by Jack at 11:39 UTC+7 [04:39Z]. No design yet. ClickUp: **DGS-170** (list O.3: Roles,
task id `14zcebruqtk`). **Blocked by DGS-172** (what a project is, and the project workflow). **It blocks DGS-169.**

**Source:** Jack's exploration of a persistent maestro (DGS-169, `backlog/maestro-in-herdr.md`). He called it "a new role or new way of
working". Moving the maestro from a Desktop session to a VPS agent only makes sense once the roles are defined.

## Decided (Jack, 2026-10-04)

- **Master: represents the user.** The end user, in the role of the one who gives the orders.
- **Maestro: represents the highest rank of servant, a butler.** So "butler" is the picture, not a separate name: the maestro **is** the
  head butler of a project. The household reads: the Master, then the Maestro (the head butler), then the workers (the servants). The other
  names that came up (Butler, Master as the maestro's name, Operator, Controller, Orchestrator, Grindstone) are dropped.
- **One maestro per project.** Not one for the whole system ("a mess"), not one per client or repo. It needs a definition of "project"
  (DGS-172). The Master decides which projects get a maestro, and starts and stops them.
- **The maestro holds all the state.** The Master uses only the Master's client (to give orders) or an Observer (to watch), never a worker
  directly.
- **No kicker.** "We will not keep the kicker, because now we still need a kicker to reset the maestro session." The kicker is the
  workaround for a Desktop maestro that cannot be reset from outside.
- **Moved out of this item:** the Observer is DGS-175; building the two clients is DGS-174 (the "Operator" there is the Master's client);
  the Scout, the Reviewer and "what does Jack do" are DGS-171.
- **Out of scope:** the maestro's review steps ("another ticket", Jack).
- **A requirement for this design:** the maestro's state kept in one structured place that a client can read (a state file: the roster, the
  open questions for the Master, a decision log with a reason each, the next steps), not only in prose notes.

## To define

- **Maestro.** Today: decides, orders workers, answers their prompts at checkpoints, keeps the notes (runbook, backlog, memory), does not do
  the work (DGS-146, "just give out orders"). Define: its job in one sentence, what is never its job, what it reports to the Master and
  when, what it may decide alone.
- **Master.** Who it is (a person, or an app acting for them), what it decides (policy, design approvals, which projects exist), what it
  never has to do (answer routine worker prompts), and how it takes over from the maestro and hands back. One typist at a time (herdr
  allows one typing client per pane).
- **The relation between them:** orders down, reports up, one state held by the maestro.

## Questions to settle first

- **The unit of a maestro** is a project (DGS-172 defines it). Does a maestro end when its project ends, like a worker (a flux that closes
  it)?
- **Many maestros, one set of resources.** A ticket has at most one maestro. Two maestros must not brief a worker for the same ticket or
  fight over the account matrix, the free memory, or the runbook. Who holds the registry: the herdr session, the runbook, or ClickUp?
- **The three maestros we have.** `DigiSmith`, `Emma` and `Soveron` (one per project, each with a herdr session of the same name) stay
  until the new design lands. What do they become?
- **Where each role lives:** a herdr pane, an OpenCode server (`opencode serve` on localhost, reached by an SSH tunnel), a Desktop session, a
  laptop client.
- **How a maestro is resumed and renewed with no kicker.** The Flux protocol (DGS-154) was written for a Desktop maestro; its rule 6 and the
  "Maestro flux" (M1 to M7) are reopened.
- **Which seat or model the maestro uses** (fixed on `dev0` today; a TokenReply model spends no seat quota).
- **What state it keeps, and where** (its note, the runbook, ClickUp as the source of truth).

## Output

A design in the ticket's board folder: the two roles with a definition, rights and one example each, the resume path with no kicker, the
state file, and a recommendation for DGS-169's shape (herdr agent, OpenCode server, or both). Brainstormed with Jack, since the design
questions are his. A worker may run the sessions (`digismith:brainstorming`), the maestro answers the routine ones.

## Log of Jack's statements (kept for the record)

- 11:2x: "we need another backlog item to brainstorm the new role, which must be done before this"; no kicker; Observer agreed; the typing
  role's name open (Operator, Controller, Orchestrator, Grindstone).
- 11:2x: the maestro count "should not be per client or repo", decided by the operator, "what the client user, me, could do". Then, after
  the question "what is a maestro's unit?": "one maestro for a project". Then: each project has one maestro, "a butler to manage our
  project for the end user"; the end user uses only a client; the butler holds all state. "Maybe we could call it Master role."
- 11:3x: "Forget the observer, put it into another backlog now, just focus on the master and butler. I've decided the role:" followed by
  "Master: represent the user. Maestro: represent the highest rank of servant, a butler."

## Related

[maestro-in-herdr.md](maestro-in-herdr.md) (DGS-169, blocked by this item), [define-the-observer-role.md](define-the-observer-role.md)
(DGS-175), [build-observer-and-operator-clients.md](build-observer-and-operator-clients.md) (DGS-174), [define-scout-reviewer-and-jack-roles.md](define-scout-reviewer-and-jack-roles.md)
(DGS-171), [define-project-and-project-workflow.md](define-project-and-project-workflow.md) (DGS-172), [maestro-delegates-builds-to-workers.md](maestro-delegates-builds-to-workers.md)
(DGS-146), [persistent-worker-pool-k8.md](persistent-worker-pool-k8.md), DGS-154 Flux (rule 6), DGS-156 (methodology vocabulary).
