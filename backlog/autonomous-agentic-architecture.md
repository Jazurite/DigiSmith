# Agentic architecture 2, Autonomous: persistent workers that pick up tickets without Jack

**Status:** Idea, Jack's call (2026-10-06 UTC+7). No design yet. ClickUp: **DGS-185** (list E.4: Workflows, task id `14zcebruzkd`, created 2026-10-06 UTC+7).

**Source:** Jack, 2026-10-06, after the MacBook was off and could not be woken. He wants persistent workers (and a persistent maestro, DGS-169)
on an always-on host, running without a human in the loop: "it needs a workflow, a set standard. Where do they find the task? Where do they
get it from the backlog? How do they know a ticket can be worked on, and access the data?"

## Naming

Two architectures, the second evolves from the first (Jack, 2026-10-10; replaces "Agentic = the one big system" of 2026-10-06):

1. **Agentic Architecture** (or **Agentic System**; name open between the two), what runs today: persistent herdr workers on an always-on
   Workbox, with Jack in the loop. He approves, answers worker prompts, and says "go".
2. **Autonomous Agentic Architecture** (or **Continuous Agentic Architecture**; name open between the two), this item, the evolved form: the
   same agents pick up and finish tickets alone; Jack is only reached through an escalation queue.

These are two architectures of one system. They are not clans or lineages, so no new ClickUp folder or list is made for them. Jack's spoken
word was first transcribed "Archanted" and "Argentic"; both mean "agentic" (corrected 2026-10-06).

## Draft contract (a proposal, not decided)

1. **Where tasks live.** ClickUp is the queue. `backlog/*.md` and `.digismith/board/<ticket>/` (DGS-158) hold the detail, and the ticket links
   to them. A worker never browses the backlog. The maestro, or a command such as `dg next`, hands it exactly one ticket.
2. **When a ticket is workable (Ready).** All of: status Ready (the only gate, set by Jack or the maestro); a written spec with acceptance
   criteria and scope; every ticket that blocks it is done; an autonomy label (**auto**: the worker may finish alone, **review**: it stops at
   a checkpoint for Jack); the repo and the credentials it needs are named. Anything that fails stays in Backlog.
3. **Claiming.** The worker sets In Progress and records its agent name. A lock stops two workers taking one ticket. A timeout releases the
   claim if the worker dies. One workspace per ticket stays (see the workspace-per-ticket rule).
4. **Data and access.** Each ticket gets a context bundle: the spec, linked docs, a worktree checkout, and a scoped set of credentials
   declared by the ticket's label (for example the `github-emma` key only for Emma tickets). Worker permissions come from a guardrail
   file Jack writes (DGS-155).
5. **Finishing.** The worker runs tests and a Sol review. An **auto** ticket is pushed and marked Done. A **review** ticket goes to the
   escalation queue and Jack gets a phone notification. The maestro verifies findings and cleans up the workspace.

### Split by reversibility

- **Runs alone:** read-only work, dispatching workers, tests, reviews, backlog capture with its ClickUp task, local commits and pushes under the
  existing commit rules.
- **Asks Jack:** merging to main or changing the shared plugin; outward-facing writes (other ClickUp edits, Jira or Teams posts, Emma repos);
  deletes and overwrites; anything that changes permissions or the guardrail; spending beyond a quota cap.

### The loop

The maestro wakes on events (worker finished, review back, a schedule), not by polling. A decision it needs goes to the escalation queue
and it carries on with other tickets. A heartbeat shows Jack within minutes if the maestro is down. Per-day quota and worker caps stop a
runaway loop from burning the seats.

### Where it runs

Availability matters more than power. The always-on host should be a box that stays up. The Mac Workbox cannot be powered on remotely, and a
full shutdown cannot be woken over LAN (see DGS-182), so a cheap always-on box is the likely home for the maestro, with heavy workers on the Mac.

## Smallest first slice

The Ready checklist, a `dg next` command, and claim and release, run on a few low-risk **auto** tickets (docs, tests). Then widen the
"runs alone" list as it earns trust.

## Open questions

1. Where the Agentic system and its two architectures are documented (a doc in the repo, a ticket field, or both).
2. Is the Ready status plus the "pickup" field (see `clickup-ready-status-and-pickup-field.md`) already enough for step 2?
3. Which host is the always-on one, and who pays for it after the Hetzner subscription ends?
4. How does a worker get a scoped credential without reading token files?

## Related

DGS-169 (persistent maestro in herdr), DGS-170 (Master role), DGS-176 (Maestro role), DGS-171 (Scout, Reviewer, Jack), DGS-154 (Flux),
DGS-155 (approval guardrail), DGS-158 (ticket-based naming), DGS-182 (the Mac move), `clickup-ready-status-and-pickup-field.md`.
