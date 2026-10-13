# DGS-417 probe: writing a Maestro card by hand (S11)

CLI: `node --experimental-strip-types --no-warnings scripts/session-card-cli.ts` (run from the DigiSmith checkout or the plugin root). `started`, `last_seen` and `status` default to now and `open`. The command validates first and writes nothing for an invalid card. A real run in a TEMP depot (`--depot <dir>`) wrote `cards/jack-maestro--pending-hook.yml` and read it back (2026-10-13 13:42 UTC+7).

## One line: a Maestro card (role maestro, machine, state, NO under)
```sh
node --experimental-strip-types --no-warnings scripts/session-card-cli.ts new --field name=jack-maestro --field role=maestro --field id=jack-maestro --field session=<engine-session-id> --field domain=DigiSmith --field state=.digismith/sessions/DigiSmith/note.md --field runs_on="Claude Code Desktop over SSH" --field machine=<where-jack-sits> --field created_by=jack
```
It prints the card path: `~/.digismith-depot/sessions/DigiSmith/cards/jack-maestro--<session>.yml`. Add `--dry` to print the card without writing, `--depot <dir>` to use another depot. Put the real engine session id in `session` (use `pending-hook` only until a hook replaces it). `under` must NOT be given for a maestro (the validator refuses it); `machine` is required.

## Other commands
```sh
... validate <file>                       # ok, or the errors (exit 1)
... write <file>                          # a hand-written card file into cards/
... read DigiSmith jack-maestro <session> # print it back
... find <session> [project]              # path of the open card of a session
... list DigiSmith --scope open           # open | archive | all
... touch DigiSmith jack-maestro <session>              # refresh last_seen
... close DigiSmith jack-maestro <session> --result "text"   # archive, never delete
... lost  DigiSmith jack-maestro <session>              # archive as lost
```
A card for the conductor (role conductor): same `new`, plus `--field under=jack --field mandate=<order path>`, `--field state=<note path>`, `--field runs_on="herdr w2:p1"`.
