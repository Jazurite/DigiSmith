# Execution approach: choose by parallelism and context, not by task count

**Status:** Idea, Jack's request (2026-10-03). No design yet. ClickUp: **DGS-148** (Town Hall, because the B clan is not
synced to ClickUp yet), related to DGS-146 and DGS-139. DGS-147 was the same ticket in the wrong list (B.0: Maestro). It
is marked as moved, and Jack archives it.

**Source:** Live session 2026-10-03, DGS-142. `digismith:writing-plans` chose inline execution for a 2-task plan.
Jack: the decision should not "just depend on the number of tasks". With 11 tasks that run in sequence and share the
same context, the right answer is one subagent that runs the whole plan.

## What's wrong

`skills/writing-plans/SKILL.md`, "Execution Handoff", step 3, picks the path by task count:

- 1-2 tasks, none unusually risky: `digismith:executing-plans`, inline.
- 3 or more tasks, or a risky task: `digismith:subagent-driven-development` (SDD), one fresh subagent per task and a
  two-stage review after each.

Task count says little about the cost or the benefit:

- **11 sequential tasks with shared context.** SDD starts 11 cold subagents. Each one re-reads the same files, loses
  what the previous one learned, and gets its own review. Nothing runs in parallel, so the isolation buys nothing.
- **2 independent heavy tasks.** The rule sends them inline, although two parallel subagents would be faster and keep
  the controller's context small.

`executing-plans` also tells the controller that Superpowers "works much better with access to subagents" and to use
SDD when subagents exist. That is a blanket claim, and it pushes the same task-count rule from the other side.

## The idea

Add two measures to the decision, next to risk:

1. **Parallelism.** Can tasks run at the same time? Independent groups of tasks, and the length of the longest chain
   of dependent tasks.
2. **Context engineering.** How much context do the tasks share, and how much must a fresh subagent re-read? What
   does the controller's own context hold, and what should stay out of it?

The plan can supply both without extra work from the author:

- Each task already lists its `Files:`. The overlap between two tasks' files shows how much context they share.
- A `Depends on:` line per task gives the groups and the longest chain.

A first decision matrix, to be tuned:

| Shape of the plan | Approach |
|---|---|
| All tasks in sequence, shared files | One subagent runs the whole plan with `executing-plans`: a self-check per task and one whole-branch review at the end. The controller runs it inline when the plan is small. |
| Two or more independent groups, separate files | One subagent per group, in parallel. Inside a group the tasks run in sequence. |
| Mixed | Groups run in parallel. Each group is one subagent. |
| A risky task (shared mutable state, security path) in any shape | Add an independent review for that task only. |

## Open questions

- Where the measures live: computed by `writing-plans` from the plan text, or declared in a plan header field.
- Whether SDD needs a "subagent per group" mode, or whether a group is just a smaller plan.
- Where the controller's context limit enters: a long controller context may favor a subagent even for a small plan.
- Whether a worker (herdr) counts as the "one subagent" for a whole plan. See
  [maestro-delegates-builds-to-workers.md](maestro-delegates-builds-to-workers.md).

## Where this would land, not yet decided

`skills/writing-plans/SKILL.md` (Execution Handoff), `skills/executing-plans/SKILL.md` (the opening note) and
`skills/subagent-driven-development/SKILL.md`. These are DigiSmith's forks of the Superpowers skills. The earlier
"Subagent-driven always" decision (map item H, original meaning) shows that this choice has changed before.
