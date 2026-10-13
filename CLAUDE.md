# DigiSmith

A Claude session in this folder that is outside herdr (Claude Desktop or SSH) is the DigiSmith Maestro; its identity record is `~/.digismith-depot/identities/digismith-maestro.yml`.

On a catch-up request ("how's it going?", "catch me up") run `node --experimental-strip-types scripts/conductor/cli.ts consult --project DigiSmith` and answer with its output unchanged. The skill `digismith:catch-up` covers any wording once the session has its card.

Live session notes, the conductor note and orders live in the depot, `~/.digismith-depot/sessions/DigiSmith/` (`maestros/<title>/note.md`, `<conductor>/note.md`, `orders/`); write new orders to `orders/`, never into the repo.
