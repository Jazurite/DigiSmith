# Define the Master role (the user's role)

**Status:** Design decided by Jack (2026-10-04 12:07 UTC+7 [05:07Z]): all four open questions answered. The item is the design record. ClickUp:
**DGS-170** (list O.3: Roles, task id `14zcebruqtk`). The Maestro role (the head butler) is DGS-176 (`backlog/define-the-maestro-role.md`).

**Source:** Jack's exploration of a persistent maestro (DGS-169, `backlog/maestro-in-herdr.md`). He called it "a new role or new way of
working". The roles are a household: the **Master** (the user), the **Maestro** (the head butler), the workers (the servants).

## The Master role (decided, Jack, 2026-10-04)

- **A Master represents the user.** Anyone who holds an SSH key authorized on the VPS is a client with the Master role. There can be
  several Masters (Jack, a future colleague). The role is defined by the credential, not by an app.
- **A Master session attaches to a persistent maestro on the VPS.** The maestro lives on the VPS. The Master's session attaches and
  detaches. There is no take-over ritual.
- **The Master's client can be anything** that attaches with the key: a terminal (`herdr attach`), the Desktop app over SSH,
  `opencode attach`, a web page behind a tunnel. Nothing new has to be built for the role to exist (DGS-174 builds a better client later).
- **A maestro is started by a command.** The Master decides which projects get a maestro (one per project, DGS-172) and starts it with a
  `dg` command. It replaces today's manual steps: a herdr session plus a Desktop session of the same name (DGS-173). The command's name and
  home are open (DGS-151, DGS-176).
- **The Master uses only a client or an Observer** (DGS-175), never a worker directly.
- **Identity: the SSH key, for now** (Jack: "For 170 we'll rely on the SSH key for now"). The stronger layers are deferred, not dropped:
  Tailscale, a hardware-backed signing key and signed orders, and a non-root maestro (DGS-177). The analysis behind this is kept in DGS-177
  (moved there verbatim on 12:07 UTC+7 on 2026-10-04). The `PasswordAuthentication no` change was declined.
- **The other names are dropped:** Operator, Controller, Orchestrator, Grindstone, Butler (the maestro is the butler), and "Master" as the
  maestro's name.

## A risk Jack accepted that is now live

Jack accepted the SSH key as the proof of the Master's identity "for now", on the condition that it is revisited before a maestro runs in a
pane. Answer 2 (a persistent maestro on the VPS) makes that moment the design of DGS-176 and DGS-169, not a later one. A typed order in a
pane cannot be told from a worker's `herdr agent prompt`, and every process on the VPS runs as root. **DGS-176 must answer how the maestro
tells a Master's order from a worker's before the maestro is moved.** The options are in DGS-177's background section.

## Handed to other items (nothing is left open in this one)

- **DGS-176 (the Maestro role):** the maestro is persistent on the VPS and the Master attaches to it; started by a command. With several
  Masters attached, the typing rule: a herdr pane has one typing client at a time, an OpenCode session takes several clients. The decision
  log should record **which Master** gave each order (a label the client sends, or one authorized key per Master). A "stop" order that halts
  the maestro at its next safe point (my proposal, not yet Jack's).
- **DGS-169 (the maestro in herdr):** the shape must support several attached Masters.
- **DGS-174 (the clients):** the Master's client must let a Master give an order, answer a question, and approve or stop a step.
- **DGS-171:** what the Master decides and never has to do (below).
- **DGS-177:** the identity layers and the VPS hardening.

## What the Master decides, and never has to do (moved to DGS-171)

Policy, design approvals, which projects exist, the ClickUp writes the maestro may not make; and the Master never has to answer routine
worker prompts or create a ticket for a backlog item. DGS-171 holds the detail ("what does Jack do").

## Log of Jack's statements (kept for the record)

- 2026-10-04 11:2x: "we need another backlog item to brainstorm the new role, which must be done before this"; no kicker; Observer agreed;
  the typing role's name open (Operator, Controller, Orchestrator, Grindstone). The maestro count is decided by "the operator, what the
  client user, me, could do"; then "one maestro for a project"; "a butler to manage our project for the end user".
- 11:3x: "Forget the observer, put it into another backlog now, just focus on the master and butler."
- 11:5x: "Master: represent the user. Maestro: represent the highest rank of servant, a butler."
- 11:40: "Decouple the maestro change to another ticket. 170 fully focus on the Master role."
- 11:5x: "I'm the master, so maybe whoever holds the SSH key connection to the VPS, with a password, is classified as Master." Then Tailscale
  and a stolen key were discussed; "For 170 we'll rely on the SSH key for now." `PasswordAuthentication no` declined.
- 12:07: answers to the four questions: "1. Several, anyone with the SSH key is a client with the master role. 2. Master session attach to a
  persistent maestro on VPS. 3. Anything. 4. Duh, by command."

## Related

[define-the-maestro-role.md](define-the-maestro-role.md) (DGS-176, the head butler), [maestro-in-herdr.md](maestro-in-herdr.md) (DGS-169),
[define-the-observer-role.md](define-the-observer-role.md) (DGS-175), [build-observer-and-operator-clients.md](build-observer-and-operator-clients.md)
(DGS-174), [define-scout-reviewer-and-jack-roles.md](define-scout-reviewer-and-jack-roles.md) (DGS-171),
[define-project-and-project-workflow.md](define-project-and-project-workflow.md) (DGS-172), [harden-access-to-the-vps.md](harden-access-to-the-vps.md)
(DGS-177), [maestro-delegates-builds-to-workers.md](maestro-delegates-builds-to-workers.md) (DGS-146), DGS-155 (approval guardrail),
DGS-156 (methodology vocabulary).
