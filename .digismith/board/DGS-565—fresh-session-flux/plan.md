# DGS-565 research plan: fresh session from the note instead of clear + kicker

**Goal:** answer the ticket's question with a one-page `report.md` and a recommendation. Spec: `spec.md` (approved by Jack, 2026-10-26).
Docs only. No code, no build, no branch. The "tests" are the probes below. Every probe is named `dgs-565-probe` and lives in the scratchpad.

**Report path:** `.digismith/board/DGS-565—<slug>/report.md` (the researcher commits it to main at the end, with a pathspec).

## Rules for every task
- Never touch a real Maestro, conductor, worker, or the Emma and Soveron workspaces.
- No delete. A probe session is left for Jack to delete or archive on his order.
- Never read or print a token, key or `.env`. The probe note holds no secret.
- Times: UTC+7 first, UTC in brackets.

## Task 1: Read (no side effect)
Read, and write one line of finding per file:
- `~/Workspace/Library/mattpocock-skills/skills/in-progress/claude-handoff/SKILL.md`
- `skills/handoff/SKILL.md` (Clearing, Resume Mode), `.opencode/skills/flux/SKILL.md`
- Runbook `.digismith/sessions/workbox.md`, section "Maestro flux" (M1 to M7, kicker options tested)
- `.digismith/docs/E/E.4/flux-protocol/design.html`, `scripts/conductor/flux.ts`, `flux-herdr.ts` (how the conductor flux starts a new agent)
- `~/.digismith-depot/identities/digismith-maestro.yml` and the session-start hook that reads a session title (what ties a note to a session)
- `claude --help`, `claude agents --help`, `claude logs --help`
- `.digismith/board/DGS-555—flux-no-gate/spec.md` (so the report does not repeat it)
Check also: does the session tool list of a Maestro hold a start-session call? Run `ToolSearch` for `session_mgmt` in a Maestro-like Desktop session, or read the tool names the SessionStart hook mentions. The runbook says none existed on 2026-10-03.
**Output:** a "read" block of notes. Answers to spec questions 1, 2, 4 as far as reading allows.

## Task 2: Safe probe T1, note passed by file
1. Write `<scratchpad>/dgs-565-probe/note.md` with a normal handoff note shape and these traps: a line with backticks around `echo TRAP1`, a line with `$(echo TRAP2)`, a line with `$HOME`.
2. In `<scratchpad>/dgs-565-probe/`, start `claude --bg --name "dgs-565-probe-T1" -- "Read the file note.md in this folder and say its first line and whether it holds a line with the text TRAP."`
3. Read `claude logs dgs-565-probe-T1`. Pass if the logs show the traps as plain text and no `TRAP1` or `TRAP2` output from a shell.
4. Repeat with the pattern from Pocock's doc, `"$(cat note.md)"`, only in a shell where the note is quoted by the shell (record what the shell does: it is the shell, not claude, that expands). Record the result as evidence for the "by file" rule.
5. `claude agents` to list; stop the probe with `claude stop dgs-565-probe-T1` (stop, not delete). Leave removal to Jack.
**Output:** pass or fail for T1, with the log lines.

## Task 3: Probe T2, what a fresh background session knows
In the same scratch folder, start `dgs-565-probe-T2` with the probe note as its brief. Ask it to list: its session title, the hooks that fired (SessionStart lines), and whether it can find the note by title.
Compare with what a real Maestro gets (read from the `get_session` fields and the hook text; do not start a Maestro).
**Output:** table rows for "survives" and "lost".

## Task 4: Probe T3, Desktop start-session (only if Task 1 found a tool)
If a start-session call exists: start one session titled `dgs-565-probe` whose first message is "read <scratchpad path>/note.md". Read its `get_session` (title, group, id). Do not call `delete_session`. Ask Jack for the archive or delete order in the report.
If no such call exists: write "not possible today" with the proof (tool list), and skip.
**Output:** survives or lost for title, group, identity, Remote Control; and how the old session is archived (call name, approval needed).

## Task 5: Probe T4, herdr agent seeded from a file
Through `herdr-ws` (HERDR_WS set as the runbook says), in a scratch tab of the workspace Jack names, start an agent `dgs-565-probe` with a first message that points at the note file. Time from the command to the first reply. Close the tab after (tab cleanup is automatic for probes). If the workspace or seat is not clear, ask the conductor before starting.
**Output:** the time, what the agent saw, and whether the seat, name and `--add-dir` settings carry over.

## Task 6: Cost and failure modes
Fill the table for the three options A (clear + kicker), B (fresh session from the note), C (hybrid):
- Jack's manual steps (count them from M1 to M7 and from the probes).
- Tokens: the kicker polls every 10 s for up to 15 minutes. Compute the polls and read real token use from the status line or `dg tokens` for one probe run. Do not guess.
- Time from "flux" to a working session.
- Failure modes: lost kick, dropped clear (runbook "If something goes wrong") against B's failures (note not found by title, two live sessions on one title, a note path that depends on the old session's id).
- Whether the kicker can go away (which of M1 to M7 vanish).

## Task 7: Write the report and commit it
`report.md`, one page: the question, the table, the recommendation (B, A or C), and, only if the recommendation changes the flux, a list of follow-up tickets with size. The spike creates no ticket itself; the conductor files them on Jack's word.
Commit step as in the refine order: lock `.commit-lock`, `git pull --ff-only`, copy `report.md` into the board folder, commit `docs(dgs-565): add the spike report` with a pathspec of that one file, push, `dg clickup upload-attachment --task DGS-565 --file report.md`, remove the lock.

## Stop and ask
- A permission prompt: report its exact text and stop.
- A probe would touch a real session or need a delete: stop, ask the conductor.
- Task 1 shows `claude --bg` cannot take the session title as the Maestro's title: still finish the report; that is a "lost" row, not a blocker.

## Definition of Ready (Refiner check, 2026-10-26)
| Item | State |
|---|---|
| Spec | `spec.md`, approved by Jack 2026-10-26 |
| Plan | this file |
| Milestone | none on the ticket. Proposed: after Dawn, since nothing in Genesis or Dawn waits on it. Jack sets it on approval |
| Blockers | none found. ClickUp shows one dependency link between this ticket and DGS-470 (ClickUp Synchronization); direction unclear in the API output, not a blocker for a read-and-probe spike. Conductor to confirm |
| Mode | Auto confirmed. The work is read plus throwaway probes, no build, no merge of code. The only Jack touch points are the archive or delete of a probe session and one possible workspace choice for Task 5 |
| Sign-off | Jack confirmed. The recommendation can change every Maestro flux and which manual steps remain, and only Jack weighs that |
| Priority | Normal (already set) |
