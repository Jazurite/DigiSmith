# Define the Master role (the user's role)

**Status:** Idea, Jack's call (2026-10-04): "we need another backlog item to brainstorm the new role". Narrowed by Jack at 11:40 UTC+7 [04:40Z]:
"Decouple the maestro change to another ticket. 170 fully focus on the Master role." No design yet. ClickUp: **DGS-170** (list O.3: Roles,
task id `14zcebruqtk`). The Maestro role (the head butler) is DGS-176 (`backlog/define-the-maestro-role.md`).

**Source:** Jack's exploration of a persistent maestro (DGS-169, `backlog/maestro-in-herdr.md`). He called it "a new role or new way of
working". The roles are a household: the **Master** (the user), the **Maestro** (the head butler), the workers (the servants).

## Decided (Jack, 2026-10-04)

- **Master: represents the user.** The end user, in the role of the one who gives the orders.
- **The Master decides which projects get a maestro,** and starts and stops them. One maestro per project (DGS-172 defines "project").
- **The Master uses only a client or an Observer,** never a worker directly: a client to give orders (the Master's client, DGS-174; it was
  called the "Operator" before the roles were named), or an Observer to watch (DGS-175).
- **The other names are dropped:** Operator, Controller, Orchestrator, Grindstone, Butler (the maestro is the butler), and "Master" as the
  maestro's name.

## To define

- **Who the Master is.** A person, or an app acting for the person. Can there be more than one Master for a project, or only one at a time?
- **What the Master decides** (policy, design approvals, which projects exist, the ClickUp writes the maestro may not make) and **what it
  never has to do** (answer routine worker prompts, create a ticket for a backlog item). DGS-171 holds the detail of "what does Jack do".
- **How the Master takes over from a maestro and hands back.** One typist at a time (herdr allows one typing client per pane).
- **What the Master sees and how it is told:** what the maestro reports to the Master and when (the maestro's side is DGS-176), and the
  Master's own view, the Observer (DGS-175).
- **The Master's client.** What it needs to do (give an order, answer a question, approve or stop a step); built in DGS-174.
- **Authority.** How the Master's word reaches the maestro and workers. A peer message cannot grant escalation, and an approval inside a
  guardrail needs limits the Master writes (the approval guardrail Jack wrote, DGS-155). The Master role has to say how a Master's order is
  told apart from a worker's or another session's message.

## Questions to settle first

- **Where the Master's client runs:** a laptop terminal, the Desktop app over SSH, `opencode attach`, a web page behind an SSH tunnel.
- **How the Master starts a maestro** for a new project (DGS-172 and DGS-173: today a project is a name, a Git repository, a dedicated herdr
  session and a Desktop maestro of the same name).
- **Many Masters or one,** and how the three of us (Jack, a future colleague) would share a project.

## Output

A design in the ticket's board folder: the Master role with a definition, rights, what it never has to do, and one example, plus how a
Master order is recognised. Brainstormed with Jack. A worker may run the sessions (`digismith:brainstorming`), the maestro answers the
routine ones.

## Log of Jack's statements (kept for the record)

- 2026-10-04 11:2x: "we need another backlog item to brainstorm the new role, which must be done before this"; no kicker; Observer agreed;
  the typing role's name open (Operator, Controller, Orchestrator, Grindstone). The maestro count is decided by "the operator, what the
  client user, me, could do"; then "one maestro for a project"; "a butler to manage our project for the end user".
- 11:3x: "Forget the observer, put it into another backlog now, just focus on the master and butler."
- 11:5x: "Master: represent the user. Maestro: represent the highest rank of servant, a butler."
- 11:40: "Decouple the maestro change to another ticket. 170 fully focus on the Master role."

## Related

[define-the-maestro-role.md](define-the-maestro-role.md) (DGS-176, the head butler), [maestro-in-herdr.md](maestro-in-herdr.md) (DGS-169),
[define-the-observer-role.md](define-the-observer-role.md) (DGS-175), [build-observer-and-operator-clients.md](build-observer-and-operator-clients.md)
(DGS-174), [define-scout-reviewer-and-jack-roles.md](define-scout-reviewer-and-jack-roles.md) (DGS-171),
[define-project-and-project-workflow.md](define-project-and-project-workflow.md) (DGS-172), [maestro-delegates-builds-to-workers.md](maestro-delegates-builds-to-workers.md)
(DGS-146), DGS-155 (approval guardrail), DGS-156 (methodology vocabulary).
