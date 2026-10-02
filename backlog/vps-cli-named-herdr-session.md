# `vps status`/`vps connect` hard-code herdr's `default` session

**Status:** Finding, confirmed live. Jack chose to leave it for now (2026-10-02).

**Source:** Live session 2026-10-02 (Claude desktop-app session "Main", manager mode: one Claude session managed herdr worker agents on EMKT-791 and EMKT-810). Full retro: [manager-mode-retro-2026-10-02.md](manager-mode-retro-2026-10-02.md).

## What's wrong

`packages/cli/src/vps/` never passes `--session`, and `~/.digismith-depot/vps.json` has no session
field. herdr supports named sessions (`herdr --session <name>`). On 2026-10-02 Jack split herdr into
`emma` and `DigiSmith` sessions, so `default` is empty. `vps status` now reports
"Workspace/agent alive: FAIL", and `vps connect` would rebuild `opencode-main` in `default`.

## The idea

An optional `session` field in `vps.json` (default `default`), passed as `--session <name>` to
every herdr call in `status` and `connect`, including `agent attach`.

## Related

[herdr-persistent-multiplexer-x.md](herdr-persistent-multiplexer-x.md), and the existing
workspace-dedup note referenced by the depot skill (`vps-connect-workspace-dedup-x1.md`).
