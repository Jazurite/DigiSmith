# DGS-565 spec: spike, should a Maestro flux start a fresh session from the note?

Type: Spike (1023). Clan B.4 Maestro. Deliverable: a short report with a recommendation. No build, no code change.

## Question
Today a Maestro flux has two parts: write the handoff note, then clear the session (`clear_session` on self) while a
kicker session waits and sends `Arise` (runbook "Maestro flux", M1 to M7; skill `handoff`, Clearing).
Matt Pocock's `claude-handoff` does it the other way: write the summary to a file, start a fresh background agent
seeded with it (`claude --bg --name "<name>" -- "$(cat <file>)"`), leave the old session alone.

Should a Maestro flux start a fresh session from the note (Desktop `start_session` with the note as its brief; in herdr, a
new agent seeded from the note file) instead of clear + kicker?

## What the spike finds out (the five questions in the ticket)
1. **What survives** a fresh session, per item: title, session card, identity record
   (`~/.digismith-depot/identities/digismith-maestro.yml`, its `state:` path), the note path (it is found from the title),
   the sidebar group, Remote Control, hooks and plugin state, the Desktop session id other sessions use to message it.
2. **What is lost** or must be rebuilt: any id that other tools hold (orders, the conductor note, `send_message` targets),
   the context the note does not carry.
3. **How the old session is archived.** Archive is a state change, not a delete. Delete needs Jack's order
   (memory: deletes need Jack), so the report must say who archives and by which call.
4. **Whether the kicker can go away.** The kicker exists because a cleared session cannot wake itself. A fresh session starts
   with the note as its first message, so it needs no `Arise`. The report states which steps M1 to M7 vanish.
5. **Cost against clear + kicker:** Jack's manual steps (today: open the kicker, paste, delete it), tokens (the kicker
   polls every 10 s), time from "flux" to a working session, and failure modes (lost kick, dropped clear).

## Method: what is only read, what is tried live
**Read only (no side effect):**
- Pocock's `skills/in-progress/claude-handoff/SKILL.md` (local clone `~/Workspace/Library/mattpocock-skills`).
- Our `skills/handoff/SKILL.md`, the runbook "Maestro flux" (`.digismith/sessions/workbox.md`), the flux design
  `.digismith/docs/E/E.4/flux-protocol/`, `scripts/conductor/flux-cli.ts` and `flux.ts` (the conductor flux, which already
  starts a new agent in herdr).
- `claude --help`, `claude agents --help`, and the tool list of a Maestro session: does a start-session call exist?
  The runbook says "No tool can start a session" (2026-10-03); the ticket says `start_session`. The report checks which is true today.
- DGS-555's spec (the flux without the check gate) so the report does not repeat it.

**Tried live (only in a throwaway, never a real Maestro):**
- T1. `claude --bg --name "dgs-565-probe" -- "$(cat <file>)"` is the pattern the ticket warns about. Try instead the file form
  (`< file` or a one-line prompt "read <file>") with a probe note holding backticks and `$(...)`, and check nothing runs.
- T2. In a scratch directory, start a background session with a probe note and read what it knows (`claude logs`, `claude agents`).
- T3. If a Desktop start-session tool exists, start one probe session titled `dgs-565-probe`; read its `get_session` fields
  (title, group, identity) and compare with a real Maestro's. Archive then needs Jack's order; the probe is left for Jack to delete.
- T4. herdr: start a probe agent in a scratch workspace tab with the note file as its first message; close it after.
- Never touch a real Maestro, conductor, worker or the Emma and Soveron workspaces. No real note is overwritten: the probe note lives in the scratchpad.
- Every probe is named `dgs-565-probe`. No key, token or `.env` is read.

## Measures
A table with one row per question above, for three options: A = clear + kicker (today), B = fresh session from the note,
C = hybrid (fresh session, old session cleared and archived later). Columns: survives, lost, manual steps for Jack, tokens
(read from `dg tokens` or the status line, not guessed), failure modes, verdict.

## Deliverable
`report.md` in the ticket folder, at most one page, with: the table, a recommendation (adopt B, keep A, or C), and, only if
the recommendation is a change, the list of follow-up tickets with their size. No follow-up is created by the spike itself.

## Technical choices (decided here, with reasons)
- **Report is Markdown.** It is a short text with one table; the repo keeps spike reports as `.md`.
- **Probes use the scratchpad and the name `dgs-565-probe`.** A probe cannot be mistaken for a Maestro and cannot overwrite a real note.
- **The note is passed by file, never by shell interpolation.** The ticket and Pocock's own text warn that backticks and `$` truncate or run.
- **Option C is measured even if B looks better.** A fresh session that leaves the old one running doubles the sessions on one title; C is the safe path if archive needs Jack.
- **The spike does not decide the final policy on deleting the old session.** That is Jack's rule already (deletes need Jack); the report only names the call.

## Out of scope
Any change to `skills/handoff/SKILL.md`, the runbook, the kicker or `flux.ts`. The conductor night flux (DGS-434/435). The check gate (DGS-555, done).

## Proposed Sign-off and Mode
Sign-off: Jack, because the recommendation can change how every Maestro flux works and which of his manual steps stay.
Mode: Auto for the research (read plus throwaway probes, docs only); the follow-up tickets, if any, get their own Mode.
