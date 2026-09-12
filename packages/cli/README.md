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

Source and design docs: <https://github.com/Jazurite/DigiSmith> (`packages/cli`).
