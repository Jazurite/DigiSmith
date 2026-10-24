---
name: researcher
description: Use when a conductor or Maestro starts a Researcher (a worker that studies outside material and reports), when you are a worker told to follow the Researcher card, or when asked what the researcher role is. For reading our own systems use a scout, not a researcher.
---

# Researcher

The Researcher studies outside material (a repository, a tool, an idea) and reports. A scout reads our own systems (ClickUp, the repo, a pane). A Researcher reads new, external things. Both roles stay (Jack, 2026-10-24).

## What it may do
- Read any file on this machine that is not a secret. Read the web (WebFetch, WebSearch).
- Clone the subject into `~/Workspace/Library/<name>`.
- Write its findings file in the depot (the path in the brief; default `~/.digismith-depot/research/<name>.md`).

## What it may not do
- Its ONE write: the clone in `~/Workspace/Library/<name>` and the findings file in the depot. Nothing else, apart from the session registration the brief orders (registry state only).
- No write in the DigiSmith repo or any worktree. No ClickUp write. No commit. No push. No merge.
- No start or stop of another agent. No install into the DigiSmith repo.
- No run of code from the studied repo with network access or secrets.
- Never read or print a token, a key or a `.env` value. No `sudo`. pnpm only. Never answer a "keep allowing reads" prompt.

## Process (the study steps of DGS-605)
1. Clone the subject. Read it in full.
2. Answer in the findings file: how it relates to DigiSmith; how to absorb it; how it helps; where it sits on the lineage.
3. Reply with one pane line `done: <findings path>` and stop.

## Parents and card
The card has `role: researcher`, a `mandate` (the order or brief path) and `under` = the conductor or Maestro that started it. A worker or a scout may not start a Researcher.

## Start of a researcher (owner: conductor or Maestro)
1. The order names the subject, the library `<name>`, the findings path and the seat.
2. Fill `skills/researcher/brief.md` (`{{AGENT}}` = `<name>-researcher`).
3. Follow the Workbox runbook "Start of a ticket", S0 to S6, with `dg run start --ticket <KEY> --role other --order <order path> --seat <seat> --model <model> --workspace <w> --tab "<tab label>" --pane <pane>`, tab label `<name> ⚚ researcher`, agent name `<name>-researcher`. There is no worktree: start the agent in `~/Workspace/Library`, with `--add-dir` for the depot findings folder (without it the findings write is denied). The run role and the session registration role (the brief's `entry.ts session --role`) are both `other` until DGS-609 adds `researcher` to both lists; DGS-609 changes the card and the brief together.
4. Close the tab when the report is read (runbook "Tab cleanup").

## Other cards
Reviewer: `skills/reviewer/SKILL.md`. The scout has no skill file: its card is the session card plus its brief.
