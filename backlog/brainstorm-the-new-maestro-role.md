# Brainstorm the new maestro role: Maestro, Observer and Operator (before the maestro moves to herdr)

**Status:** Idea, Jack's call (2026-10-04 11:2x UTC+7 [04:2xZ]): "we need another backlog item to brainstorm the new role, which must be
done before this" (before DGS-169, the maestro in herdr). Narrowed at 11:2x UTC+7: "This one focus on Maestro, Observer and Operator";
Scout, Reviewer and Jack moved to DGS-171. No design yet. ClickUp: **DGS-170** (list O.3: Roles, created 2026-10-04 11:23 UTC+7 [04:23Z],
task id `14zcebruqtk`).

**Source:** Jack's exploration of a persistent maestro (DGS-169, `backlog/maestro-in-herdr.md`). He called it "a new role or new way of
working". Moving the maestro from a Desktop session to a VPS agent only makes sense once the role itself is defined. This item is that
definition, and **it blocks DGS-169**.

## Decided so far (Jack, 2026-10-04)

- **No kicker.** "We will not keep the kicker, because now we still need a kicker to reset the maestro session." The kicker is the
  workaround for a Desktop maestro that cannot be reset from outside. The new design removes the need, so it is not kept as a fallback.
- **Observer: agreed.** A client that watches a maestro without disturbing it (read-only: reads panes, never types).
- **Scope:** this item defines the Maestro, the Observer and the Operator. The Scout, the Reviewer and Jack's own role are DGS-171.
- **How many maestros (Jack, 2026-10-04 11:2x UTC+7):** not one maestro for the whole system ("it would be a mess"), and not one per client
  (a customer or project such as Emma or Soveron) or per repo. The number is decided by the **Operator**. "The Operator is what the
  client user, me, could do": the Operator is the role of the person at the client (today Jack). They start, attach to, type to and stop
  maestros, and they decide how many exist. The name of that role is still open (see below). This replaces today's three maestros
  (`DigiSmith`, `Emma`, `Soveron`), which were one per project.

## What to brainstorm

- **Maestro.** Today: decides, orders workers, answers their prompts at checkpoints, keeps the notes (runbook, backlog, memory), and does
  not do the work (DGS-146, "just give out orders"). Does that change? The count is the Operator's call (decided above), so the open
  question is what a maestro is *for* if it is not a project. What is its job in one sentence, and what is never its job?
- **Observer.** What it can see (panes, the note, the board). How it attaches (`herdr pane read`, `opencode attach` read-only).
- **Operator.** The role of the end user at a client (Jack): decides how many maestros exist, starts and stops them, attaches, and types
  to them. It can be a person or an app acting for the person. One typist at a time? How it takes over from a maestro, and hands back.
  How it differs from the Observer (read-only).
- **The name of the typing role is open.** Jack, 2026-10-04 (by voice, unsure): he likes "Operator" a bit but wants to look for a better
  word. Candidates he said: Operator, Controller, Orchestrator, Grindstone. A note on the last two: "orchestrator" is the word our own notes
  already use for the maestro ("the Desktop orchestrator"), so it would collide. Settle the name in the brainstorm, with the Methodology
  vocabulary (DGS-156).

## Questions to settle first

- **The unit of a maestro, now that it is not a project.** A goal or workstream the Operator names when starting it ("get DGS-159 to the
  end", "clean the Workbox")? Does it end when its goal ends, like a worker (a flux that closes it)?
- **Many maestros, one set of resources.** A ticket has at most one maestro. Two maestros must not brief a worker for the same ticket or
  fight over the account matrix, the free memory, or the runbook. Who holds the registry: the herdr session, the runbook, or ClickUp?
- **The three maestros we have.** `DigiSmith`, `Emma` and `Soveron` stay until the new design lands. What do they become?

- Where each role lives: a herdr pane, an OpenCode server (`opencode serve` on localhost, reached by an SSH tunnel), a Desktop session, a
  laptop client.
- How a maestro is resumed and renewed with no kicker. The Flux protocol (DGS-154) was written for a Desktop maestro; its rule 6 and the
  "Maestro flux" (M1 to M7) are reopened.
- Which seat or model the maestro uses (it is fixed on `dev0` today; a TokenReply model spends no seat quota).
- What state the maestro keeps, and where (its note, the runbook, ClickUp as the source of truth).
- Two clients typing into one pane: the rule that keeps the Observer from interfering and one Operator at a time.

## Output

A design in the ticket's board folder: the three roles with a definition, rights and one example each, the resume path with no kicker,
and a recommendation for DGS-169's shape (herdr agent, OpenCode server, or both). Brainstormed with Jack, since the design questions are
his. A worker may run the sessions (`digismith:brainstorming`), the maestro answers the routine ones.

## Related

[maestro-in-herdr.md](maestro-in-herdr.md) (DGS-169, blocked by this item), [define-scout-reviewer-and-jack-roles.md](define-scout-reviewer-and-jack-roles.md)
(DGS-171, the other roles), [maestro-delegates-builds-to-workers.md](maestro-delegates-builds-to-workers.md) (DGS-146),
[persistent-worker-pool-k8.md](persistent-worker-pool-k8.md), DGS-154 Flux (rule 6), DGS-156 (methodology vocabulary).
