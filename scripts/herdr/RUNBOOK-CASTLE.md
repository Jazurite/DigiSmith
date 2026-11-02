# Runbook text for the Castle (DGS-683)

This is replacement text for the runbook sections "Layout", "After a reboot", "Tab cleanup" and the role table lines. It is NOT written into `.digismith/sessions/workbox.md`: that file is untracked and the conductor edits it. The word "Suite" in the spec and the plan means Castle.

## Words

| Word | Meaning |
|---|---|
| **Castle** | The herdr session named `Castle`. Conductors only. Socket `~/.config/herdr/sessions/Castle/herdr.sock`. |
| **Floor** | The herdr session `default` (herdr cannot rename a session). Workers, Builders, Reviewers, Scouts, Researchers. One workspace per project (DigiSmith w2, Emma w3, Soveron w4), one tab per ticket. No conductor tab. |
| **Project conductor** | Takes attended work from the Maestro. Examples: `digismith-conductor`, `emma-conductor`. |
| **Factory conductor** | Nobody except the scan prompts it. Owns the line (claim, advance, merge, release) for every project. |
| **Ticket conductor** | One per ticket, named `tc-<ticket lowercase>`. Drives Builder, Reviewer and merge for that ticket, then closes. |
| **Standing conductor** | Long-lived, owns a topic: main, dawn, token-economics, d3, scheduling. Lives in its project's Castle workspace. |
| **On-call (Nightwatch)** | Started for an attention item, named `nw-<id>`. Started and closed like a ticket conductor. |

## Layout

Two herdr sessions. The Castle holds the conductors, the Floor holds everything they drive.

| Castle workspace | Holds | Folder |
|---|---|---|
| `Factory` | factory-conductor, later on-call conductors | the DigiSmith repo |
| `DigiSmith` | digismith-conductor, main, dawn, token-economics, d3, scheduling, ticket conductors of DigiSmith tickets | the DigiSmith repo |
| `Emma` | emma-conductor, Emma ticket conductors | `~/Workspace/Emma/shopify-hub` |
| `Soveron` | the Soveron conductor (standby) | `~/Obsidian/Knowpolis/1. Soveron` |

One tab per conductor, tab label = agent name. No tab 1 rule: no conductor is special by position. A tab labelled `tc-*` or `nw-*` may be closed by its conductor; no other Castle tab can be closed through herdr-ws.

Every conductor is described by one entry in `~/.digismith-depot/conductors.json` (`session`, `workspace`, `floor`, `kind`, `note`). The bootstrap reads the list from there and writes the Castle workspace ids back.

## After a reboot

1. Wait for auto-login (1 to 2 minutes).
2. `herdr session list` shows `default` and `Castle` running. Two LaunchDaemons start them: `com.jazurite.herdr` (Floor) and `com.jazurite.herdr-castle` (Castle).
3. Run `~/.local/bin/herdr-bootstrap.sh` once (idempotent, 30 to 45 seconds). It handles both sessions. `DRY_RUN=1` only prints what it would change.
4. A conductor that stops at "trust this folder": answer it in its pane (down arrow, Enter) and run the script again.
5. herdr brings agents back after a restart as `claude --resume <id>` with the history and WITHOUT the launch flags. The bootstrap relaunches each conductor with its flags and the same session id. An open ticket conductor is relaunched the same way; the bootstrap never creates one. It logs `ticket conductor <name> not running, start it with dg conductor start-ticket` for an open entry with no live agent.

## HERDR_SCOPE

Every conductor runs with `HERDR_SCOPE`, a comma list of `session:workspace` pairs. It is set by the bootstrap or by `dg conductor start-ticket`, never by the conductor itself.

| Kind | `HERDR_SCOPE` |
|---|---|
| project, standing, ticket | `Castle:<its own Castle workspace>,default:<every Floor workspace>` |
| factory | `Castle:<Factory workspace>,default:<every Floor workspace>` |

Example: `HERDR_SCOPE=Castle:w7,default:w2,default:w3,default:w4`. Without `HERDR_SCOPE`, `HERDR_WS=w2` still means exactly `default:w2` (the old rule).

`herdr-ws --session Castle agent list` reads the Castle; without `--session` the call goes to the Floor. The wrapper never accepts a `--session` or `--socket` of its own beyond that first argument.

**A text argument is ONE quoted argument.** Text that contains `--flag=value` goes to `herdr-ws` as one quoted argument (for example `herdr-ws pane run w2:p5 'cd /x && export A=b'`). herdr-ws refuses any argument that looks like `--flag=value`, also inside a text payload; a bare `--note=x` is refused, and so is a prompt text that starts with `--`. Quote the whole text so it is one argument, and put no `--flag=value` word at the start of it.

## Own workers first

Every conductor can use and control any worker of any project, but it works on its own workers first. Reaching a worker of another conductor is allowed and logged: the wrapper appends one line to `~/.digismith-depot/drivers/<KEY>.log` (who, acted-on, verb, time). The driver of the ticket does not change by that.

## Ticket conductors

- Start (a project or the factory conductor): `dg conductor start-ticket --ticket KEY --under NAME`. It refuses a ticket that already has a driver, writes the driver record and the registry entry `Project/tc-<key>`, creates the tab `tc-<key>` in the project's Castle workspace and prints the registry key and the pane id.
- Close (the ticket conductor, after merge and push): write the final note line, then `dg conductor close --self`, then close its own tab with `herdr-ws --session Castle tab close`.
- Hand over: `dg conductor handover` rewrites the driver record with the new driver.
- Lost ones: `dg conductor sweep` lists registry entries of kind `ticket` whose pane is gone, so the starter can restart or close them.

## Tab cleanup

On the Floor the conductor closes finished worker, Reviewer and probe tabs without asking, as before. In the Castle only the owner closes a `tc-*` or `nw-*` tab; every other Castle tab stays.

## Scripts and where they install

The repo holds proposals. The conductor installs them by hand; an agent never installs anything and never runs `sudo`.

| File in `scripts/herdr/` | Install path |
|---|---|
| `herdr-boot-castle.sh` | `~/.local/bin/herdr-boot-castle.sh` |
| `com.jazurite.herdr-castle.plist` | `/Library/LaunchDaemons/com.jazurite.herdr-castle.plist` (root-owned; Jack types the `sudo` lines) |
| `herdr-bootstrap.sh` | `~/.local/bin/herdr-bootstrap.sh` |
| `conductor-watch` | `~/.digismith-depot/bin/conductor-watch` (targets `Castle/<name>` or `Castle/<pane>`) |
| `../opencode-boot/herdr-ws` | `~/.digismith-depot/bin/herdr-ws` |
| `fake-herdr.sh` | test double only; never installed |
