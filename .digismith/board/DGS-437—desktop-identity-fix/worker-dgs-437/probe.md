# DGS-437 first use (after merge, push and plugin update)

The record `digismith-maestro` already exists from DGS-411's first use (`identity-cli.ts show digismith-maestro`). Plugin reload: hook 02 (plugin update); a NEW desktop session picks it up.

## Jack watches
1. Open a NEW Claude Desktop Code session in the DigiSmith folder and send any message, e.g. "hello".
2. The card appears: `node --experimental-strip-types scripts/session-card-cli.ts list DigiSmith --scope open` shows `digismith-maestro`, role `maestro`. Ask "who are you?": the session names the identity, project, conductor (the identity line was added as context).
   This is also the measurement: a card written on the first message means UserPromptSubmit fires in desktop sessions.
3. Send "how's it going?": the catch-up from the conductor (Done, Running, Waiting for Jack, Decided, Parked, Next, Health), by the skill digismith:catch-up (the session has its card).
4. If NO card appears after step 1: UserPromptSubmit does not fire either. Tell the Maestro; the line in `CLAUDE.md` is then the working path (ask "how's it going?" and the session runs the consult command).
5. A herdr worker or the conductor shows no identity line (they keep their env cards).

## Then
Set DGS-437 and DGS-411 done with plain dates (the Maestro does it after Jack's confirmation).

## Cleanup
The card is real depot data: leave it. Closed cards are archived, never deleted.
