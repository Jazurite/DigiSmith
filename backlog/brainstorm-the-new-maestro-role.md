# Brainstorm the new maestro role (and the roles around it) before the maestro moves to herdr

**Status:** Idea, Jack's call (2026-10-04 11:3x UTC+7 [04:3xZ]): "we need another backlog item to brainstorm the new role, which must be
done before this" (before DGS-169, the maestro in herdr). No design yet. ClickUp: **DGS-170** (list O.3: Roles, created 2026-10-04 11:20 UTC+7 [04:20Z], task id `14zcebruqtk`).

**Source:** Jack's exploration of a persistent maestro (DGS-169, `backlog/maestro-in-herdr.md`). He called it "a new role or new way of
working". Moving the maestro from a Desktop session to a VPS agent only makes sense once the role itself is defined. This item is that
definition, and **it blocks DGS-169**.

## What to brainstorm

Define the roles and who may do what, then decide where each one runs.

- **Maestro.** Today: decides, orders workers, answers their prompts at checkpoints, keeps the notes (runbook, backlog, memory), and does
  not do the work (DGS-146, "just give out orders"). Does that change? One maestro for the whole system, or one per clan or repo
  (today `DigiSmith`, `Emma`, `Soveron`)?
- **Observer.** A client that watches a maestro without disturbing it (read-only: reads panes, never types). What can it see?
- **Operator.** A client that can type to a maestro (Jack, or an app). One typist at a time? How does it take over from the maestro, and
  hand back?
- **Worker.** Unchanged: a ticket, a brief, no state (DGS-158). Does a worker ever talk to an Observer?
- **Scout.** A worker that only reads (Jack, 2026-10-03: "it should be a scout"). It had no ticket. This item covers it.
- **Reviewer.** Sol or another independent model. Out of scope here (Jack, 2026-10-04: the maestro's review steps "will be tackled by
  another ticket"); only the place it takes in the role map.
- **Kicker.** Retired by a persistent maestro, or kept as a fallback for a Desktop maestro?
- **Jack.** The one who decides design questions. Which decisions stay his, and which the maestro may make alone.

## Questions to settle first

- What is the maestro's job in one sentence, and what is never its job?
- Where each role lives: a herdr pane, an OpenCode server, a Desktop session, a laptop client.
- How a role is resumed and renewed (the Flux protocol, DGS-154, was written for a Desktop maestro: rule 6 reopens).
- Which seat or model each role uses (the maestro is fixed on `dev0` today; a TokenReply model spends no seat quota).
- What state each role keeps, and where (the maestro's note, the runbook, ClickUp as the source of truth).
- Names: a role name must be a word Jack would say (Scout is one). Settle the vocabulary with the Methodology list (DGS-156).

## Output

A design in the ticket's board folder: the role list with a definition, rights and one example of each, then a recommendation for DGS-169's
shape (herdr agent, OpenCode server, or both). Brainstormed with Jack, since the design questions are his. A worker may run the sessions
(`digismith:brainstorming`), the maestro answers the routine ones.

## Related

[maestro-in-herdr.md](maestro-in-herdr.md) (DGS-169, blocked by this item), [maestro-delegates-builds-to-workers.md](maestro-delegates-builds-to-workers.md)
(DGS-146), [persistent-worker-pool-k8.md](persistent-worker-pool-k8.md), DGS-154 Flux (rule 6), DGS-156 (methodology vocabulary),
`feedback_scout-role` in the maestro's memory.
