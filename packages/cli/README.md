# @digismith/cli

DigiSmith's command line. Installs the `digismith` binary and its short alias `dg`.

Ships as plain compiled JavaScript — nothing to build yourself. Requires Node 24 or newer.

```bash
pnpm add -g @digismith/cli
```

## Commands

```
digismith vps status      # read-only health report of the VPS claude session
digismith vps connect     # fix what's safely fixable, then attach interactively

digismith depot clone ensure     # clone ~/.digismith-depot/repo if missing, else no-op
digismith depot clone refresh    # fetch + hard-reset the clone to origin/main
digismith depot opencode ensure  # start the shared OpenCode server if not already running
digismith depot opencode stop    # stop it
digismith depot bridge ensure    # start the Agentic Bridge proxy if not already running
digismith depot bridge stop      # stop it

digismith --version
```

`dg` accepts exactly the same arguments.

`vps` expects `~/.digismith-depot/vps.json`, written by hand once:

```json
{
  "host": "203.0.113.10",
  "user": "root",
  "identity_file": "~/.ssh/id_ed25519",
  "tmux_session": "claude-main"
}
```

`vps connect` ends in an interactive `ssh -t … tmux attach`, so run it from a real terminal (Windows Terminal, PowerShell, cmd, or a macOS/Linux terminal) — not from an agent's shell tool or MinTTY Git Bash without `winpty`. `vps status` works from anywhere.

`depot bridge ensure` needs to run from inside a DigiSmith checkout (or pass `--repo <path>`)
— it launches that checkout's own `scripts/agentic-bridge/server.ts`, which isn't published in
this package.

Source and design docs: <https://github.com/Jazurite/DigiSmith> (`packages/cli`).
