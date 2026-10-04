# ClickUp: a "ready" status and a "Pickup" field, so the maestro knows what it may start

**Status:** Idea, Jack's call (2026-10-04 14:32 UTC+7 [07:32Z]): "A task will have a dedicated status that says it has been fully refined and is ready
to be worked, and another custom field to indicate that the task is picked up automatically by the maestro or must wait for the Master's
opinion. But this is in another backlog." Split out of DGS-176 (the Maestro role). No design yet. ClickUp: **DGS-179** (list E.4: Workflows, created 2026-10-04 14:32 UTC+7 [07:32Z], task id `14zcebrur0k`).

**Source:** DGS-176, the 24/7 autonomy section. The maestro classifies every ticket before it works on it ("does this need a Master's
opinion?"). Jack's answer is to make the classification a property of the ticket itself, so the maestro reads it and the Master sets it.

## What Jack asked for

1. **A dedicated status: "fully refined and ready to be worked."** A ticket reaches it when its scope, acceptance and decisions are written
   down well enough that a worker can start from a brief.
2. **A custom field** that says who picks the ticket up: **automatically by the maestro**, or **must wait for the Master's opinion**.

## What exists today (checked 2026-10-04)

- All 24 DigiSmith lists share one status set: `backlog`, `concept`, `discovery`, `to do`, `in progress`, `review`, `release`, `done`,
  `documentation`. There is no `ready`. `to do` is the closest: it could mean "ready", or a new `ready` status could sit before it.
- The client can read and set a custom field on a task (`getListFields`, `setCustomField`), but **the CLI cannot create a field** and, as far
  as the maestro knows, not a status either. Precedent: the `Kind` field of the Methodology clan (Process, Protocol, Procedure, Primitive)
  was created by Jack in the ClickUp UI.

## Proposal (to settle with Jack)

- **Status `ready`,** placed between `discovery` and `to do` (or reuse `to do`: decide which).
- **Field `Pickup`,** a dropdown with two values: `Maestro` (the maestro may start it by itself) and `Master` (it waits for a Master's
  opinion). **The default is `Master`.** An empty field counts as `Master`.
- **The rule the maestro follows** (it becomes a line in the policy, DGS-176): it starts a ticket by itself only when its status is `ready`
  **and** `Pickup` is `Maestro`. Anything else, it does not start. A ticket that turns out to need a Master's opinion midway is parked, and
  the maestro sets `Pickup` to `Master` and writes the question on the ticket (a ClickUp write the policy must allow).
- **Who sets them:** the Master, when refining a ticket. The maestro may propose `Maestro` for a ticket that clearly fits the policy's classes,
  but only the Master's setting counts.

## Open questions

- Add a `ready` status, or reuse `to do`? How a status is added to 24 lists (the UI, or an API call).
- Is `Pickup` a field on every list, or on the space? Who creates it (Jack, in the UI, like `Kind`)?
- What "fully refined" means as a checklist (a goal, a scope, the decisions, a test or an acceptance line).
- What happens to the 177 existing tickets: nothing, or a one-off pass that sets `Pickup`.

## Related

[define-the-maestro-role.md](define-the-maestro-role.md) (DGS-176, the autonomy section and the policy draft),
[backlog-item-gets-clickup-task.md](backlog-item-gets-clickup-task.md) (DGS-163), [maestro-posts-clickup-progress-comments.md](maestro-posts-clickup-progress-comments.md)
(DGS-178), [convert-backlog-files-to-tickets.md](convert-backlog-files-to-tickets.md) (DGS-165), DGS-156 (the `Kind` field and the vocabulary).
