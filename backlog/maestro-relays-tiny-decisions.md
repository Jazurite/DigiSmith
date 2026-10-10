# Improve the maestro role: relay tiny decisions to the worker instead of asking Jack

**ClickUp:** **DGS-314** (list Imperium, backlog; proposed home in the ticket); key written back by the DGS-165 sweep, 2026-10-10.

**Status:** Idea, Jack's rule (2026-10-03). No design yet. No ClickUp ticket yet. It belongs with the maestro and worker
protocol (A.2: Protocols) and the maestro role (O.3: Roles). Related: `maestro-delegates-builds-to-workers.md` (DGS-146).

**Source:** Live session 2026-10-03, the delete of the empty `Miscellaneous` list in clan A. Jack had ordered it in words
("if miscellaneous is absorbed by pavilion delete it"). The worker's classifier blocked the delete script, and the worker
waited for "my call". The maestro asked Jack which of two ways to unblock it, and Jack answered: "Confirm the delete, this
decision you can make yourself, right?" Then he added the rule: "for some tiny decision that you know that I only approve and
just need to relate or repeat to the worker, you could do it yourself. The master will do it instead of asking the user."

## What's wrong

A worker stops and waits for a decision that Jack has already made, or that he would only answer "yes" to. The maestro
passes the question up to Jack, Jack says yes, and the maestro passes the yes back down. Jack is a relay between two
sessions that could have settled it without him. This is the same fault as in `maestro-delegates-builds-to-workers.md`, on
a smaller scale: the gate reaches Jack although it is not his to answer.

## The rule

- When a worker asks for something Jack already decided in the maestro session, the maestro answers the worker with that
  decision, quoting Jack's words and where he said them. It does not ask Jack again.
- When a worker asks for a tiny decision that Jack would only approve (reversible, inside the scope Jack already
  approved, no money, nothing posted outside, no permanent delete he did not order), the maestro decides, tells the worker,
  and tells Jack afterwards in one line.
- The maestro asks Jack when the decision is his: the approval rules in the maestro playbook (force-push, merge, live-theme
  change, Teams post, global theme-setting value, JIRA drafts, permanent deletes), scope, money, and anything the maestro
  cannot judge.
- The maestro never invents an authorization. A relayed decision quotes Jack's real words.

## A limit found the same day

A relayed authorization does not satisfy the worker's own auto-mode classifier. On 2026-10-03 the worker's script that
deleted the list was denied ("External System Writes") twice: first with the maestro's brief, then after the maestro told
the worker that Jack had confirmed. The worker stopped, as ordered, and did not look for another way. So for destructive or
external writes the "relay" still needs one of: Jack's own message in the worker's pane, a Bash permission rule for that
script, or Jack doing the write himself. The maestro must not route around the denial, for example by running the same
delete from its own session. A tiny-decision rule covers questions, not classifier blocks.

Jack (2026-10-03): a task that needs a delete is approved by Jack only, so it is never a tiny decision. When the classifier
blocks one, Jack picks the way out. On 2026-10-03 he chose to start an OpenCode session for the delete (OpenCode has no
Claude Code classifier), after first offering to do it himself in the ClickUp UI.

## Guardrail: approval within limits (Jack, 2026-10-03)

Jack wants to give the maestro the approval privilege, as long as it stays inside a guardrail. He rejected renaming
the verbs (for example "CR" and "DE") to get past the classifier: that hides the action from Jack and from the
classifier on purpose. The guardrail is open, in plain words, and it is Jack's. The ClickUp ticket is DGS-155 (E.4).

Action classes (a draft):

| Class | Examples | Who approves |
|---|---|---|
| Read | pane reads, `get-task`, listings | nobody |
| Write, reversible | create a ticket, rename a list, set a field value | the maestro, one log line |
| Write, destructive | delete a list, a task or a file, force-push | Jack each time, unless the script is pre-approved (below) |
| Credential use outside the CLI | the Frontdoor script, any token | Jack, after a dry run, unless pre-approved |
| Agent hop | send an action to another agent | only for a pre-approved script |

How a pre-approved action works:

1. Pre-approved scripts live in one directory (for example `~/.digismith-depot/approved/`). Jack reviews a script once,
   when it enters the directory.
2. Each script is built the same way: preconditions inside it that stop it without a write (name, folder, 0 tasks),
   a dry run by default, a read-back after, and no token in the output.
3. Jack writes one permission rule that allows only that directory. This is the part only Jack can do: the classifier
   accepts his rule, not the maestro's word.
4. The maestro may approve and run any script in that directory, or tell a worker or an OpenCode session to run it.
   Anything outside the directory goes to Jack each time.
5. Each run leaves one line: what ran, which approved script, the result.
6. Limits that no script may cross: no token output, no merge or force-push, nothing sent outside (Teams, JIRA).

## Open

- Where it is enforced: the maestro playbook, the role definition (O.3), or the maestro protocol in A.2.
- Whether the maestro keeps a short log of the decisions it relayed (one line each in its handoff note), so Jack can audit
  them.
- Whether a permission rule for worker scripts that are already approved in words can be generated, so a destructive step
  Jack ordered does not stop at the classifier.
