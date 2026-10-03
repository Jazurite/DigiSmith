# Enforce: the maestro delegates ticket builds to workers

**Status:** Idea, Jack's rule (2026-10-03). No design yet. ClickUp: **DGS-146** (list O.3: Roles), related to DGS-139,
DGS-144 and DGS-145.

**Source:** Live session 2026-10-03, DGS-142 (migrate DigiSmith's own repo to `config.yml`). The Desktop maestro
ran `digismith:init`, brainstorming and the plan in its own session. Jack had to answer every gate: a release-gate
question, the design approval, the spec review and the plan approval. Jack: "all these user input prompts could easily be
answered by you ... we must enforce this". For DGS-142 itself Jack kept the build in the maestro session, so the rule
starts with the next ticket.

## What's wrong

The maestro did not weigh delegation. Dispatching a worker takes about seven manual runbook steps
(`.digismith/sessions/workbox.md`, "Switch lineage or ticket"), RAM is tight, and the ticket looked small. So the
maestro built it inline. Every `AskUserQuestion` gate in `init`, `brainstorming` and `writing-plans` then reached Jack,
and most of them were not his to answer.

## The rule

- The maestro does not run a ticket's build flow in its own session: `init`, `bootstrap`, `adopt`, `brainstorming`,
  `writing-plans`, `executing-plans`, `subagent-driven-development`. It dispatches a herdr worker and supervises.
- The maestro answers the worker's prompts at checkpoints (design sections, spec review, plan, task diffs), as in
  `feedback_maestro-checkpoint-reviews`. Only decisions that are Jack's go to him: the approval rules in the maestro
  playbook (force-push, merge, live-theme change, Teams post, global theme-setting value, JIRA drafts, permanent
  deletes), scope and money, and anything the maestro cannot judge.
- What stays in the maestro: backlog notes, runbook edits, ClickUp bookkeeping, handoffs, reviews, and answering workers.

## Enforcement options, not yet decided

1. **Role gate in the skills (DGS-139).** When `role` is `maestro`, `init` and the build skills stop at the top and say:
   "A maestro does not build tickets. Dispatch a worker." They print the dispatch command.
2. **SessionStart line for a maestro.** One line: "You supervise. Do not build tickets here. Dispatch a worker."
   `scripts/session-init.ts` already prints role-dependent lines, so the line costs little.
3. **Make dispatch cheap.** A command such as `dg workbox dispatch <ticket>` (DGS-139 build 2, with the per-worker
   account from DGS-144) does the runbook steps in one call. Without it, delegating stays more work than doing it
   inline, and the rule will be broken again.
4. **Playbook text.** The maestro playbook (part 2 of
   [manager-orchestrator-profile.md](manager-orchestrator-profile.md)) states the rule and the list of what goes to Jack.

Options 1 and 2 enforce. Option 3 removes the reason to break the rule. Option 4 is only a reminder, so it is not enough alone.

## Until it lands

The rule is saved as a feedback memory for the maestro, and the Workbox runbook points at this item.
