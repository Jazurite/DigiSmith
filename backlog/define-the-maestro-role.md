# Define the Maestro role: the project's head butler

**Status:** Design decided by Jack (2026-10-04 12:19 UTC+7 [05:19Z]): "Yes" to the seven defaults in the DGS-176 brainstorm. The item is the design
record. Split out of DGS-170 at 11:40 UTC+7: "Decouple the maestro change to another ticket." ClickUp: **DGS-176** (list O.3: Roles, task id `14zcebruqu3`). DGS-172 (what a project is) is decided and done. **It blocks DGS-169** (the maestro in herdr), which carries the build.

**Source:** Jack's exploration of a persistent maestro (DGS-169, `backlog/maestro-in-herdr.md`) and the role discussion in DGS-170. The roles
are a household: the Master (the user, DGS-170), the **Maestro** (the head butler), the workers (the servants).

## The Maestro role (decided, Jack, 2026-10-04)

1. **Its job.** The maestro runs one project for the Masters. It turns their orders into tickets and worker briefs, answers the workers'
   routine questions, verifies reviews and merges, and keeps the project's state. It does not do the work itself (DGS-146).
   **Never:** write the code or builds itself, act on an order that did not come from a Master, or widen its own permissions.
2. **What it reports.** It keeps a **structured state file**: the roster, the questions waiting for the Masters, a decision log that names
   which Master gave each order, and the next steps. An Observer (DGS-175) reads it. It asks a Master only for decisions that are the
   Master's, and summarizes at the end of each ticket.
3. **What it decides alone:** routine worker prompts, review verdicts it has verified, merge orders within the guardrail, the ClickUp
   backlog-task and description rules. **Not alone:** policy, design approvals, a new project, deletions, ClickUp status changes and
   comments. Those stay the Master's (detail in DGS-171).
4. **Lifetime.** It lives as long as its project. It is renewed by a flux (note, restart, `Arise`), run by a `dg` command. **No kicker.**
5. **Where it lives.** A Claude Code agent in a herdr pane first. That keeps the DigiSmith plugin and Claude's quality, and the maestro can
   already be reloaded and restarted from outside (`herdr agent prompt`). An OpenCode session is the later experiment (DGS-169, option B).
6. **The three maestros we have** (`DigiSmith`, `Emma`, `Soveron`) become the maestros of their three projects. They stay Desktop sessions
   until the persistent form works. A pilot comes first: a throwaway project, then `Soveron` (a vault, low risk), then `Emma`, and
   `DigiSmith` last.
7. **The live risk, accepted:** a typed order in a pane cannot be told from a worker's `herdr agent prompt` (every process on the VPS is
   root). Jack accepts it for now, as he accepted the SSH key (DGS-170), with one guard: **escalating actions** (a push to a shared branch,
   ClickUp writes beyond routine, deletions) wait for a stronger channel (DGS-177: Tailscale, or a signed order).

8. **It can run 24/7 on the backlog, by itself** (Jack, 12:21 UTC+7: "the maestro will sometimes run 24/7 to do the backlog; any simple
   backlog item that doesn't need the Master's permission, it just does; any ticket or task that absolutely needs a Master's opinion, it
   stops and waits for answers; otherwise most of the time the maestro could run and decide things automatically"). So the maestro is an
   **autonomous runner inside the limits of what it is permitted to do.** It gives orders, answers its workers, and uses the permissions it has.
   It stops only at something that needs a Master's opinion, and waits for the answer.

## The guard, made concrete (the maestro's reading of 6 and 7, to be confirmed)

The maestro offered "until then they go through the Desktop approval card". That card exists only for a **Desktop** session. A pane has no
human-only channel: a permission prompt in a pane is answered by typed keys, which a worker could also type. So a persistent maestro in a
pane **cannot safely carry escalating actions yet**. The consequence for the order in point 6: a persistent maestro goes live only for a
project where an escalating action is low-risk (the throwaway project, then `Soveron`). `Emma` and `DigiSmith` stay Desktop maestros until
DGS-177's stronger channel exists. This is stricter than Jack's "yes" strictly requires, and he can loosen it.

## Autonomy: the 24/7 backlog runner (Jack's use case; mechanics proposed by the maestro, to confirm)

The job is defined by one split: **does this ticket or action need a Master's opinion, or not?** A ticket that does not is done by the
maestro and its workers, start to finish, with no one asked. A ticket that does stops, and the maestro waits for an answer. The maestro is
a runner, not a chat partner, so these mechanics follow:

1. **A permission policy the Master writes** (the guardrail Jack already uses: a rule plus pre-approved actions inside limits he writes).
   It lists what the maestro may do without asking: the classes of ticket (for example docs, backlog hygiene, small fixes with tests),
   the actions (merge to `main` after tests and verified review, create a backlog ticket, sync a description, close a worker, reload a pane)
   and the limits (a quota and memory budget, how many workers at once). **The default is deny:** anything not in the policy needs the
   Master. The first policy is drafted from what Jack has approved so far, and he edits it.
2. **Every ticket is classified against the policy** before work starts. Unknown or borderline means it needs the Master.
3. **When a ticket needs the Master, the maestro parks that ticket and continues with the others** (proposal; Jack said "it stops and waits",
   which could also mean everything stops). The parked ticket goes on the state file's "waiting for a Master" list with the exact question
   and the options, and the Master is told (below). It never guesses past the question and never busy-polls for the answer.
4. **How a Master hears about it:** the state file (an Observer shows it), and a push message to the Master's device. The channel is open.
5. **Limits so it can run unattended:** it checks the seats' usage before starting a worker (the quota rule), stays inside the memory
   budget, backs off when a limit stop or a failing check repeats, and renews itself by a flux when its context fills. A loop or a
   repeated failure parks the ticket and asks.
6. **Everything it decides alone is in the decision log,** with the reason, so a Master can read what happened while it was away.

Cautions from today: the order-provenance risk (point 7) matters more when the maestro runs alone, because no one is watching each step; and
a ClickUp write beyond the routine rules (status changes, comments) is still the Master's until the policy lists it.

## Handed to other items

- **DGS-169 (the build):** the shape is a Claude Code agent in a herdr pane first; several Masters can attach (a herdr pane allows one typing
  client at a time, an OpenCode session takes several); the `dg` start, stop, renew and list commands and the project registry (DGS-172,
  DGS-151); the state file's format and place; the pilot order.
- **DGS-177:** the stronger channel for escalating actions, and the non-root maestro.
- **DGS-171:** what the Master decides and never has to do.
- **DGS-175 and DGS-174:** the Observer and the clients that read the state file.

## Still open, build-level (not blocking this design)

- Which seat or model a maestro uses. Default, not yet confirmed: Claude Code, the seat chosen at start by the quota rule (the start command
  takes the account), a TokenReply model later for mechanical maestros.
- A "stop" order that halts the maestro at its next safe point (a proposal, not yet Jack's).
- The command's name and home (`dg workbox`, DGS-151, or a sibling).
- Who arbitrates when two maestros want the last memory or the same seat: the VPS-wide roster (DGS-151).

## Log of Jack's statements (kept for the record)

- 2026-10-04 11:2x: no kicker; the maestro count should not be per client or repo; then "one maestro for a project"; then each project has one
  maestro, "a butler to manage our project for the end user", who "holds all the information, the state".
- 11:5x: "Master: represent the user. Maestro: represent the highest rank of servant, a butler."
- Then: "Decouple the maestro change to another ticket. 170 fully focus on the Master role."
- 12:19: "Yes" to the seven defaults. DGS-172 closed.
- 12:21: "We need to add some more definition for the maestro ... it will sometimes run 24/7 to do the backlog ... any ticket that absolutely needs a Master's opinion, it stops and waits for answers; otherwise it could run and decide automatically." (Point 8 and the Autonomy section.)

## Related

[brainstorm-the-new-maestro-role.md](brainstorm-the-new-maestro-role.md) (DGS-170, the Master role), [maestro-in-herdr.md](maestro-in-herdr.md)
(DGS-169, the build; blocked by this item), [define-the-observer-role.md](define-the-observer-role.md) (DGS-175),
[build-observer-and-operator-clients.md](build-observer-and-operator-clients.md) (DGS-174),
[define-scout-reviewer-and-jack-roles.md](define-scout-reviewer-and-jack-roles.md) (DGS-171),
[define-project-and-project-workflow.md](define-project-and-project-workflow.md) (DGS-172),
[maestro-delegates-builds-to-workers.md](maestro-delegates-builds-to-workers.md) (DGS-146), [persistent-worker-pool-k8.md](persistent-worker-pool-k8.md),
DGS-154 Flux (rule 6), DGS-156 (methodology vocabulary).
