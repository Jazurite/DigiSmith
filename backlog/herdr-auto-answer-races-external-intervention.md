# Herdr session's own auto-mode answers its elicitation prompts faster than an external `herdr pane run` message can redirect it

**ClickUp:** **DGS-305** (list Imperium, backlog; proposed home in the ticket); key written back by the DGS-165 sweep, 2026-10-10.

**Status:** Not applied. Findings only — no ticket, no code touched.

**Source:** Live session, 2026-09-30, working EMKT-809 in
`shopify-template-jp`. The Herdr-managed OpenCode agent (workspace `wC`,
agent id `eb41105e-3d07-44ec-b1ee-577617ea92af`) drafted its Jira
Progress Update comment with `🖼️ Screenshots/Videos: N/A`, then paused
on a menu: `1. Post as drafted / 2. Revise first / 3. Cancel / 4. Type
something / 5. Chat about this`. The Controller (this Claude Code
session) had a screenshot to add and sent `herdr pane run wC:p1 "2"` to
pick "Revise first" — but by the time that message landed, the
session's own auto-mode had already self-answered "Post as drafted" and
was already executing `update-description --key EMKT-809`. The comment
went out without the screenshot; recovering required going around the
Herdr session entirely (attaching the file directly via Jira's REST API
and posting a follow-up comment from the Controller session itself,
bypassing `jira-progress-write-back` a second time).

## What's wrong

There's no synchronization between "auto-mode is about to self-answer an
elicitation prompt" and "an external controller is about to send a
redirect for that exact prompt." Both are racing for the same decision
point, and auto-mode's own answer loop appears to run faster than the
`ssh` → `herdr pane run` round-trip from another machine/session. This
isn't a one-off UI glitch — it happened right after a *related* one in
the same task: the tagging question ("Who should be tagged for code
review on this PR?") also showed a self-generated answer (`Hieu Huynh`)
sitting unsubmitted in the pane's input line, at a moment when
`herdr agent list` showed that pane *without* `interactive_ready: true`
(unlike a sibling pane that had it). Raw `herdr pane send-keys ... enter`
had zero effect against that stuck input; only `herdr pane run` (which
appears to inject as a queued message rather than a literal keystroke)
actually got through. So there are two adjacent, maybe-related
phenomena here:

1. Auto-mode self-answering an elicitation prompt before an external
   controller's redirect for that same prompt can arrive.
2. A pane that isn't `interactive_ready` silently swallowing raw
   `send-keys` input while still accepting `pane run` messages — worth
   confirming whether #2 is *why* #1's timing is so tight (if `pane run`
   messages queue up and get drained by auto-mode's own turn loop before
   a human/controller's follow-up is even parsed as "a redirect for the
   pending menu" versus "just the next chat message").

## Why not applied yet

Low sample size — two adjacent sightings in one task, not yet confirmed
as a reproducible pattern versus a coincidence of this particular
session's timing. No design proposal exists yet for how a controller
would even signal "I want to interrupt the pending elicitation
specifically," as opposed to "send a new message" — those might need to
be different `herdr` verbs.

## Where this would land, not yet decided

- If reproducible, this is Herdr/OpenCode-integration-level behavior,
  not something a DigiSmith skill can paper over — would need either a
  slower auto-mode self-answer (some kind of grace-period before
  auto-confirming a destructive elicitation like "post to Jira"), or a
  `herdr` primitive for "pause and wait for external input" that a
  controller can invoke before an agent's own auto-mode locks in an
  answer.
- Separately, `jira-progress-write-back` (or `generate-comment`) could
  treat "post as drafted" as reversible-checked: confirm the comment
  actually persisted the fields the user cares about (e.g. don't
  self-answer past a screenshot placeholder if a screenshot was
  mentioned anywhere in the task's own context) rather than trusting the
  first draft.
- No ticket exists for either path yet.
