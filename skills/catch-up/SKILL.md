---
name: catch-up
description: Use when Jack, in a Maestro session, wants to be brought up to date on what happened while he was away, in any words ("catch me up", "how is it going?", "what is the update?", "status?", "what did I miss?"). Not for a status question inside another task ("merge it and tell me the status of DGS-12"). Runs the conductor's catch-up command and answers with its output unchanged.
---

# Catch-up

Jack's intent is "I want to catch up". Match the meaning, not a phrase: there is no keyword list.

1. Find your own values. There is no card tool.
   - First, the context line `[digismith identity] You are <name> (id <id>, role maestro), project <project>, session <session id>, conductor <conductor id>.` that the session-start hook printed (a Desktop or SSH Maestro session in a folder with an identity record, DGS-411). Take id, project, session id and conductor id from it. If another session of the identity is listed, that is normal: any session may give orders.
   - Otherwise (a Maestro session started with env): role and identity are the env vars `DIGISMITH_ROLE` and `DIGISMITH_ID`; role `maestro` continues, any other role stops (this skill is for a Maestro; your role is the card's role, not where you run). Project: `DIGISMITH_PROJECT`. Session id: the `session` field of your open card, the file `~/.digismith-depot/sessions/<project>/cards/<id>--<session>.yml` (newest `started` if several are open). Conductor id: `DIGISMITH_CONDUCTOR`, else the first conductor of `~/.digismith-depot/identities/<id>.yml`, else `<project lowercased>-conductor`.
   - No context line, no env and no card: no identity record names this folder. Ask Jack for the identity, the session id and the conductor id, or tell him to create the record with `scripts/identity-cli.ts write`.
2. Run the command with those values:
   `node --experimental-strip-types scripts/conductor/catch-up-cli.ts --maestro <id> --session <session id> --conductor <conductor id> --project <project>`
3. Answer with the output exactly as printed. The section order is fixed; do not summarise, reorder or add sections. A line `(from note, ...)` means a fresh catch-up of this identity already existed; say nothing about it.
4. Exit code 3: the conductor's note is missing, the catch-up above is still shown; add one line saying it was not saved. Exit code 4: same, the note write failed.
5. If Jack wants it re-collected now, add `--refresh`.

The same text also runs by itself before your answer when this session has been idle (another session of your identity was active since): then give the catch-up first, then answer Jack's message.
