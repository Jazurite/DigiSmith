# DGS-411 first use (after merge, push and plugin update)

## Before Jack opens the new session (the Maestro or conductor runs this once)
Creates the real record in the depot (never in the repo; refuses to overwrite):

    node --experimental-strip-types /Users/workbox/Workspace/Jazurite/DigiSmith/scripts/identity-cli.ts write \
      --id digismith-maestro --name "DigiSmith Maestro" --owner jack --project DigiSmith \
      --folder /Users/workbox/Workspace/Jazurite/DigiSmith --conductors digismith-conductor

Check: `... identity-cli.ts show digismith-maestro` and `... identity-cli.ts resolve --cwd /Users/workbox/Workspace/Jazurite/DigiSmith` (prints `digismith-maestro`).
Defaults: machine = this host name, state = `<folder>/.digismith/sessions/DigiSmith/note.md` (the Maestro's note; pass `--state` / `--machine` to change).
Plugin reload: hook 02 (plugin update); a new Claude Code session picks the hook up.

## Jack watches
1. Open a NEW Claude Desktop session in the DigiSmith folder (not inside herdr).
2. At start the session context holds `[digismith identity] You are DigiSmith Maestro ...` with its session id. Ask it: "who are you?" It names the identity, project, conductor.
3. Card: `node --experimental-strip-types scripts/session-card-cli.ts list DigiSmith --scope open` shows a card `digismith-maestro` role `maestro`, runs_on `desktop`.
4. Type "how's it going?": the catch-up runs in the template order (Done, Running, Waiting for Jack, Decided under the mandate, Parked or failed, Next, Health).
5. Open a SECOND Desktop session in the same folder: its start line says "Other open sessions of this identity: <first session>"; the list in step 3 shows two cards of one id.
6. Idle trigger: leave session A, work in B, type in A: A runs the catch-up before its answer.
7. A herdr worker or the conductor must show NO such line (they keep their env cards).

## Then
Set DGS-411 done with plain dates (`update-task --task <id> ...`).

## Cleanup
The record and the cards are real depot data: leave them. Closed cards are archived, never deleted.
