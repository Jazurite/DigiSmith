# @digismith/cli

DigiSmith's command line. Installs the `digismith` binary and its short alias `dg`.

Ships as plain compiled JavaScript — nothing to build yourself. Requires Node 24 or newer.

```bash
pnpm add -g @digismith/cli
```

## Commands

```
digismith vps status      # read-only health report of the VPS OpenCode session
digismith vps connect     # fix what's safely fixable, then attach interactively

digismith depot clone ensure     # clone ~/.digismith-depot/repo if missing, else no-op
digismith depot clone refresh    # fetch + hard-reset the clone to origin/main
digismith depot opencode ensure  # start the shared OpenCode server if not already running
digismith depot opencode stop    # stop it
digismith depot bridge ensure    # start the Agentic Bridge proxy if not already running
digismith depot bridge stop      # stop it

digismith clickup check-credentials                                # verify ClickUp credentials are present
digismith clickup list-tasks --list <id>                           # list every task on a list
digismith clickup get-task <task>                                  # fetch a single task by ID
digismith clickup get-lists --space <id>                           # list a space's folders and folderless lists
digismith clickup create-task --list <id> --name <name> [options]  # create a new task on a list (--parent <task> for a subtask, --type <name or id>)
digismith clickup update-task --task <id> [options]                # update an existing task (--parent <task> sets, "" clears; --type <name or id>)
digismith clickup list-task-types                                   # list the workspace task types (id, name, plural, description)
digismith clickup move-task --task <id> --list <id> [options]      # move a task to another List (--status-map, --move-custom-fields)
digismith clickup create-folder --name <name>                      # create a new Folder in the DigiSmith space
digismith clickup create-list --name <name> [--folder <id>]        # create a new List, in a Folder or folderless
digismith clickup update-list --list <id> [--name <name>] [--description <text> | --description-file <path>]  # rename a List and set its description
digismith clickup upload-attachment --task <id> --file <path>      # upload a file as an attachment on a task
digismith clickup frontdoor import-auth [--capture <Raw_* folder>]  # store the Frontdoor session of a Proxyman capture in ~/.digismith-depot/.env (no secret printed)
digismith clickup frontdoor dump [--capture <folder>] [--match <re>] # masked request/response bodies of the Frontdoor calls in a capture

digismith --version
```

Frontdoor commands cover what the public ClickUp API cannot do (task types today). Capture procedure: turn Proxyman on,
do the action once in the ClickUp web app, export the requests as Raw into `~/Downloads/Proxyman Captures/ClickUp/`, then run
`dg clickup frontdoor import-auth` (it never moves or changes the export). Without `--capture` both commands use the newest `Raw_*` there.
The session token expires; a 401 or 403 says to capture a new one.

`dg` accepts exactly the same arguments. `--help`, at any level, shows branded, colorized command help.

`vps` manages a persistent OpenCode agent on a VPS, supervised by [herdr](https://herdr.dev) and
backed by TokenReply. It expects `~/.digismith-depot/vps.json`, written by hand once:

```json
{
  "host": "203.0.113.10",
  "user": "root",
  "identity_file": "~/.ssh/id_ed25519",
  "workspace_label": "digismith-main",
  "agent_name": "opencode-main"
}
```

`workspace_label` names the herdr workspace `vps connect` creates when the agent is missing;
`agent_name` is the herdr agent it starts, checks, and attaches to.

`vps connect` ends in an interactive `ssh -t … herdr agent attach <agent_name>`, so run it from a real terminal (Windows Terminal, PowerShell, cmd, or a macOS/Linux terminal) — not from an agent's shell tool or MinTTY Git Bash without `winpty`. `vps status` works from anywhere.

`vps connect` also works from any directory once `~/.config/opencode/opencode.json` on the VPS
already has a `tokenreply` provider. When that provider is missing (first-time setup, or
repairing a malformed file), it needs to run from inside a DigiSmith checkout (or pass
`--repo <path>`) — it generates the provider block with that checkout's own
`scripts/providers/print-config.ts`, which isn't published in this package.

`depot bridge ensure` needs to run from inside a DigiSmith checkout (or pass `--repo <path>`)
— it launches that checkout's own `scripts/agentic-bridge/server.ts`, which isn't published in
this package.

`clickup` commands read `CLICKUP_API_TOKEN` and `CLICKUP_TEAM_ID` from `~/.digismith-depot/.env`;
`check-credentials` verifies they're present. `create-folder`, and `create-list` without
`--folder`, always create in the DigiSmith ClickUp space. `create-list --folder <id>` creates
the list inside that folder instead. `update-list` sets the description through ClickUp's
`content` field, so literal `- ` bullet lines stay as written.

Source and design docs: <https://github.com/Jazurite/DigiSmith> (`packages/cli`).
