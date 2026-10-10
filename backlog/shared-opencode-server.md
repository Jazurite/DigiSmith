# Shared OpenCode server on the Workbox: one server, a project and session per maestro

**Status:** Idea, Jack (2026-10-10 ~13:0x UTC+7 [06:0xZ]). ClickUp: **DGS-223** (C.1: Workbox, subtask of DGS-182, task id `14zcebrvcm7`). No design yet.
A ticket, not a lineage (Jack).

## Why

The DGS-169 pilot proved an OpenCode server works as the maestro hub: Jack attached from his Windows PC by browser and by `opencode attach`
(2026-10-10 ~12:5x UTC+7). Jack then decided: **one OpenCode server for all maestros** (DigiSmith, Emma, Soveron, b3, and later ones). Each maestro is
its own project and session on that server. Jack attaches once and sees every maestro.

## What exists now

- Server `opencode serve --hostname 127.0.0.1 --port 4198`, password file `~/.digismith-depot/opencode/server-password` (mode 600). Today it was started
  by the DGS-169 worker from `.worktrees/dgs-169`, detached (parent `launchd`), not restarted after a reboot.
- **Tailscale Serve** (tailnet only, not Funnel): `https://workbox.tail730dcf.ts.net` -> `http://127.0.0.1:4198`, persistent (`--bg`). Off:
  `tailscale serve --https=443 off`. The Mac is on the company network, so nothing is published to the internet.
- Global plugin `~/.config/opencode/plugins/tokenreply-key.js` (TokenReply key read in memory from `~/.digismith-depot/.env`); `~/.config/opencode`
  is pnpm only, OpenCode 1.18.35 on the Mac and on Jack's PC.
- Jack's PC: `OPENCODE_SERVER_PASSWORD` as a Windows user variable; `opencode attach https://workbox.tail730dcf.ts.net -c`; the browser works too.
- DGS-169 branch `dgs-169` (not merged): a guarded `maestro` agent (luna) and `maestro-review` (sonnet), rules prompt, four skills, probe scripts.

## To do

1. **Neutral home.** Run the server from a folder no repo owns (for example `~/.digismith-depot/opencode`), not from a repo or worktree.
2. **Always on.** A LaunchAgent: start at login, restart on crash, password from the file, never printed. Jack installs it (no background services
   by agents).
3. **No `default_agent`** in any repo config: it would apply to every OpenCode session in that repo (offload workers included).
4. **Per-project maestro template.** Each maestro project gets its own guarded agent, rules prompt and `HERDR_WS` (w2 DigiSmith, w3 Emma, w4
   Soveron); port DGS-169's config as the template. Decide where each project's sessions start (`opencode attach --dir`, the web app "Add project").
5. **Memory.** One server, many sessions: the pilot's test server reached 2.6 GB. Watch it; a scheduled restart if needed.
6. **Access.** One password unlocks every maestro: fine for Jack alone; separate access for others is a later question.
7. **Bootstrap and runbook.** `herdr-bootstrap.sh` no longer starts maestro servers; herdr keeps the workers. Update `workbox.md`.

## Related

DGS-169 (the pilot, [maestro-in-herdr.md](maestro-in-herdr.md)), DGS-182 (Dedicated Workbox milestone), DGS-177 (hardening), DGS-198 (one herdr session),
DGS-203 ([representative-decides-for-jack.md](representative-decides-for-jack.md)).
