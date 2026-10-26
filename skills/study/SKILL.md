---
name: study
description: Use when Jack asks to study, research or look into an outside repository, tool or idea, in any words ("study X", "study this repo", "research this repo", "look into this tool", a GitHub link with "study"). The Maestro does not research itself: it orders a researcher. Not for work inside DigiSmith's own code ("fix this bug", "review this branch": use the normal skills). For reading our own systems use a scout.
---

# Study

Jack's intent is "learn from this outside thing and tell me what it means for DigiSmith". Match the meaning, not a phrase.

The Maestro does not research itself. No clone, no long read and no web study in the Maestro session. Do not take "a quick look" while the researcher works. A researcher does the study. This skill never edits the DigiSmith repo.

## Order a researcher
1. Write the order to `~/.digismith-depot/sessions/<project>/orders/` (never into the repo), for example `order-study-<name>.md`.
2. The order names:
   - the subject (link or name) and Jack's words;
   - the library `<name>`;
   - the findings path `~/.digismith-depot/research/<name>.md`;
   - the seat;
   - the ticket key for the run. Use a related open ticket when the study serves one, else `study-<name>` (`dg run start` accepts any key that matches `^[A-Za-z0-9][A-Za-z0-9._-]*$`).
3. The conductor starts the researcher by the card `skills/researcher/SKILL.md`, section "Start of a researcher". The brief is `skills/researcher/brief.md`. The run role is `--role other` until DGS-609.

## What the researcher does
The card owns the detail. In short, the researcher:
- clones the subject into `~/Workspace/Library/<name>` (`git pull` if it exists) and reads it in full;
- answers three questions in the findings file: how it relates to DigiSmith, how we could absorb it, how it could help us (link the open tickets it touches);
- says where it sits on the lineage.

## The run limit (DGS-665)

- At most 2 builders (the factory ticket counts as one), 1 reviewer and 1 role are busy at once. `dg run limit` shows the count.
- `dg run start` refuses a start over the limit and names the open run. Queue the worker and retry at the next checkpoint. Never start the worker some other way.
- An idle builder (waiting for a merge or a review) is not counted. Before you wake one that is not the factory's with a fix order, run `dg run limit` and wait if its kind is full.
- A run that shows as `stale` is a dead pane. Clear it with `dg run event <run-id> lost`. Never pause or kill a running agent to make room.

## Relay
1. Read the findings file.
2. Check one or two claims against the clone.
3. Give Jack the three answers, the clone path and the findings path.

## Place it on the lineage
- An agentic spike goes to clan B: Agentic.
- Use B.5 when it is about autonomous engineering.
- Use B.0: Pavilion when no lineage fits.
- F.9: Workflows holds only established workflows. An idea reaches F.9 only after Jack adopts it.

## Write the ticket
Every study ends with a ticket. Write a Spike in that lineage with `dg clickup create-task --list <lineage list id> --name ... --type Spike --status backlog --priority 3 --markdown-description-file <file>`. Priority 3 is Normal. Get the list id from `dg clickup get-lists`. Never use a one-off script.

The ticket holds the three answers, the clone path and the findings path. Read it back with `dg clickup get-task <key>`.

A ticket is not an order. Start nothing from it until Jack says "start".

Close with the three answers and one line: the ticket key and where it sits.
