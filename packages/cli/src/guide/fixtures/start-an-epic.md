**Version 1. Adopted by Jack on 2026-11-14 UTC+7 ("Yes, we can adopt this as the first version"). Kind: Process.**

**Group:** Roadmap · **Ticket:** DGS-759

## What it is

An epic is one body of work with a clear end, under an arc on the roadmap (Imperium). This guide covers the whole flow, end to end: from the idea of an epic, through deciding it and breaking it into tickets, to the moment its first ticket starts and the Maestro session works on it.

## When to use it

*   Jack has an idea for an epic, or wants to pick up an epic he parked earlier.
*   The epic starts only when the previous epic of the same Maestro is closed (Guide: close an epic). One saga, one arc, one epic at a time. Tickets inside the epic may run in parallel.

## Steps

### 1\. The idea

1. Jack names the idea. A "could we...?" is a question: answer it. Nothing is created before his explicit yes.
2. Look for an epic that already exists. Jack often writes an epic early and parks it in `backlog` (sometimes in the Backlog saga). Search Imperium before creating anything:

`dg clickup list-tasks --list 1301150000002179`

### 2\. Shape the epic with Jack

1. Agree, in a short conversation: why the epic exists (one real story of what goes wrong today), what is in and out, and what "done" looks like.
2. Agree the name: plain words, "<plain name>: <what it puts where>", under about 8 words, no code names.
3. Show Jack the summary. Wait for his yes.

### 3\. Put the epic on the roadmap

*   **Existing epic:** read it first (`dg clickup get-task <EPIC> --markdown`). Update the name and add the shaped summary to the description; keep its history, do not replace it. If it sits under the wrong arc or saga, move it under the current arc.

`dg clickup update-task --task <EPIC> --name "<name>" --markdown-description-file <file>`

*   **New epic:** create it in Imperium (list `1301150000002179`), type Epic, under the current arc (`--parent` needs the arc's internal id, not its DGS key):

`dg clickup create-task --list 1301150000002179 --name "<name>" --type Epic --parent <arc internal id> --priority 3 --markdown-description-file <file>`

Epics never nest: an epic sits under an arc, never under another epic. Milestones are separate and are not set here.

### 4\. Break it into tickets

1. The epic's first ticket is its breakdown: list everything the epic needs, then file one ticket per piece (DGS-82 did this for Development Procedures).
2. Shape and refine that first ticket like any ticket (Guide: shape a ticket, Guide: refine a ticket).
3. File the tickets in their clan lists, each with a priority, Sign-off and Mode, and link each to the epic:

`dg clickup add-link --yes --task <KEY> --to <EPIC>`

4. Bring in existing tickets that belong to the epic the same way. Tickets that belong to another product or Maestro stay with their owner.
5. Result: the epic's whole backlog is filed, with the first tickets marked next.

### 5\. Start it

1. Move the epic to in progress with a start date, then read it back:

`dg clickup update-task --task <EPIC> --status "in progress" --start-date <today>`

The Steward cannot move an epic out of `backlog` today, so this step writes the status directly.

2. Flux the Maestro session: write the handoff note (Done / Decisions / Next / Open problems) and clear the session. Next names the epic's first ticket.
3. Rename the session to the epic. The handoff note sits under the new name, so the next "Arise" finds it.
4. Tell Jack in one line: the epic, its first ticket, and what happens next. Then start the first ticket.

## Rules

*   One active epic per Maestro. A new idea that does not belong to the epic becomes a backlog ticket, not a second epic.
*   Each step that writes to ClickUp waits for Jack's yes on the shape (step 2) or is covered by it.
*   The epic is closed by Guide: close an epic (minor version bump, release note, tag, GitHub release).

## Exceptions

*   An epic that spans two products: the epic stays in DigiSmith; the other product's tickets link to it.

## The skill that runs it

None yet. `digismith:shaping` covers step 4.2, `digismith:handoff` covers step 5.2. Sources: the Development Procedures start (2026-11-14), the DGS-82 comment, memory notes on epic names, the focus rule (DGS-706) and the roadmap layout. Open: the Steward cannot move an epic (step 5.1 is a direct write until a ticket fixes it).

* * *

Original ticket text: User-manual page (group: Roadmap) for epic DGS-740, from the DGS-82 list. Starting an epic: flux the Maestro session and rename it to the epic, move the epic to in progress (the Steward cannot move an epic today: update-task), pick the first ticket. Sources: the DGS-740 handoff note, the DGS-82 comment. Write down what we do today; a process change is its own ticket. Drafted, shown to Jack, done only on his yes (Sign-off Jack, Mode Manual).
