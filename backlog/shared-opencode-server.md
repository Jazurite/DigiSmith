# Shared OpenCode server on the Workbox: one server, a project and session per maestro

**Status:** Idea, Jack (2026-10-10 ~13:0x UTC+7 [06:0xZ]). ClickUp: **DGS-223** (C.1: Workbox, task id `14zcebrvcm7`). No design yet.
Its own epic (Jack): not a lineage and not a subtask of DGS-182; related to the Workbox, separate in itself.

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

1. **Neutral home: DECIDED (Jack, 2026-10-10 ~17:5x UTC+7): the server root is `~/.digismith-depot/opencode/`**, next to the password and
   logs. The maestro config sits at that root as a plain `opencode.json` (plus `.opencode/` with prompts and skills), loaded the normal way, no
   `OPENCODE_CONFIG`. The repo keeps the source; an install step copies it to the server root (like `herdr-ws` to `~/.digismith-depot/bin/`),
   so a merge reaches the live server only when installed. The LaunchAgent then points at the server root. Today (interim) the server runs
   from the main checkout with `OPENCODE_CONFIG=.opencode/maestro/opencode.json`.
2. **Always on.** A LaunchAgent: start at login, restart on crash, password from the file, never printed. Jack installs it (no background services
   by agents).
3. **No `default_agent`** in any repo config: it would apply to every OpenCode session in that repo (offload workers included).
4. **Per-project maestro template.** Each maestro project gets its own guarded agent, rules prompt and `HERDR_WS` (w2 DigiSmith, w3 Emma, w4
   Soveron); port DGS-169's config as the template. Decide where each project's sessions start (`opencode attach --dir`, the web app "Add project").
5. **Memory.** One server, many sessions: the pilot's test server reached 2.6 GB. Watch it; a scheduled restart if needed.
6. **Access.** One password unlocks every maestro: fine for Jack alone; separate access for others is a later question.
7. **Bootstrap and runbook.** `herdr-bootstrap.sh` no longer starts maestro servers; herdr keeps the workers. Update `workbox.md`.

## Design as Jack clarified it (2026-10-10 ~14:0x UTC+7)

The maestro **runs in OpenCode** on the shared server (a cheap model is enough to orchestrate). When work needs real power, the OpenCode
maestro **spins up a Claude Code agent** (in herdr, through `herdr-ws agent start --kind claude`) on a Claude seat, `jack` for now, running
**Opus**. The subscription is used only inside Claude Code, which is allowed; OpenCode itself never needs a Claude login. So "Opus from
Claude" means Claude Code agents started by the OpenCode maestro, not an Opus model inside OpenCode. DGS-224 (switching model sources) is
no longer a blocker for this. What it needs: the maestro may write briefs and start Claude Code agents (DGS-169 gap 3: the edit rule is
too narrow and dispatch is untested), the seat and model chosen at start (`claude-account use jack`, `--model opus`), and the result read back.

## Discussion record (Jack and the Master, 2026-10-10, 10:00 to 13:1x UTC+7)

### Decisions in order
1. **Adopt OpenCode for the maestro** (DGS-169, ~10:1x): side-by-side pilot, luna for routine turns, sonnet for reviews and decisions, key plugin global.
2. **pnpm only** (~10:3x): `pnpm add dotenv @opencode-ai/plugin@1.18.35` in `~/.config/opencode`, npm lockfiles removed. It is the DigiSmith toolchain
   rule (`toolchain.yml`: `package_manager: pnpm`), even over a folder's existing npm lockfile. OpenCode upgraded on the Mac to 1.18.35 to match the PC.
3. **Attach only after the ticket**, then changed: Jack attached during checkpoint 3 because the server was already up.
4. **No public front door now** (~12:2x): the Mac Workbox sits on the **company network**. Owning jazurite.com does not give a way in: the Mac is
   behind the company router (no port forward), and any tunnel (Cloudflare, VPS relay, Tailscale Funnel) would expose a command-running service from
   inside the company network, against usual IT policy. A public front door (`maestro.jazurite.com`, Caddy plus port forward, or a tunnel with a
   login gate) waits until the Mac is on a network Jack controls, or IT approves. DNS for jazurite.com is at Namecheap (`registrar-servers.com`).
5. **Tailscale Serve, tailnet only** (~12:4x): Jack enabled Serve and HTTPS certificates in the admin console; the Master ran
   `tailscale serve --bg --https=443 http://127.0.0.1:4198`. Checked: 401 without auth, 200 with, HTML web app at `/`. The pf anchor only guards
   ports 22, 3283, 5900, so it does not block Serve.
6. **One server for all maestros** (~13:0x): not one server per maestro; this ticket.
7. **Its own epic** (~13:1x): not a lineage, not under DGS-182.
8. **Model: Opus, from Claude** (~13:4x): the orchestrator needs Opus (more capable than sonnet). Terra pilot (step 1, report in
   `.digismith/board/DGS-223—shared-opencode-server/worker-dgs-223-terra/`): sonnet beat terra ($0.095 vs $0.100, better judgment); sonnet's true
   DGS-169 pilot cost is $0.095 (the report used $3/$15, TokenReply lists $2/$10). The OpenCode server stays and its maestros will run on
   Opus. The Claude Code maestros do not switch yet (Jack: "not yet"). Open: how Opus reaches OpenCode (TokenReply `claude-opus-5-5` at
   $4/$20 per 1M, or an Anthropic API key; a Claude subscription login in a third-party tool is not an option), and the cost of long
   maestro sessions against the $5 TokenReply allowance.

### How Jack attaches (Windows PC, worked 2026-10-10 ~12:5x)
- **Browser:** `https://workbox.tail730dcf.ts.net`, sign-in box (basic auth), username `opencode`, the server password; the browser may save it.
  An empty "Nothing here yet" screen means no project is open: **Add project** with the server's folder (today
  `/Users/workbox/Workspace/Jazurite/DigiSmith/.worktrees/dgs-169`), then open the session.
  If clicks do nothing on the empty screen, open the project by URL: the web app addresses a project as
  `https://workbox.tail730dcf.ts.net/<base64url of the folder path>/session/<session id>` (worked 2026-10-10 ~14:2x for the maestro session
  `ses_edbd33565ffeBvJA2WZeLjHW6d`; Jack typed into it, agent Maestro, model TokenReply GPT-5.6 Luna). The event stream through Tailscale was
  checked and works, so the empty-screen clicks were a missing project, not the network.
- **Terminal, no typing of the password:** once, in PowerShell:
  `[Environment]::SetEnvironmentVariable("OPENCODE_SERVER_PASSWORD", (ssh workbox "cat ~/.digismith-depot/opencode/server-password"), "User")`;
  check with `[bool]$env:OPENCODE_SERVER_PASSWORD`; then `opencode attach https://workbox.tail730dcf.ts.net -c`. Optional profile function:
  `function maestro { opencode attach https://workbox.tail730dcf.ts.net -c }`. Stored in plain text in the user profile (Credential Manager is the
  encrypted option).
- **OpenCode Desktop:** no documented "add server" screen found (feature requests anomalyco/opencode#7371, #7790; Railway's tool writes a remote
  server into Desktop, so it exists inside). If the Desktop app has a server setting: URL above, user `opencode`, the password. Unverified.
- **Alternatives kept:** `ssh -t workbox '... opencode attach http://127.0.0.1:4198 -c'` (runs on the Mac); an SSH `LocalForward 4198` in the
  `workbox` host (no longer needed with Serve); `herdr --remote workbox --session default` (shows every herdr tab, shares the one TUI pane; needs
  herdr on the PC, Windows support unknown). OpenCode 1.18.35 has no `--remote` flag; herdr 0.9.3 does.

### What the pilot showed (DGS-169 checkpoints 2 and 3)
- The server is **separate from herdr**: PID parent `launchd`; the herdr tab `opencode-maestro` is only one client. Nothing restarts it after a
  reboot or crash (hence the LaunchAgent). The worker's bootstrap text started the server in a herdr tab, which would tie it to herdr again: do not.
- **Guardrail** (luna, prompt-free `probe` agent with the same permission block): 26 probes denied, no leak; `cat`, `head`, `wc` removed from bash
  (reads go through the path-denied read tool); pipes, redirects, `;`, `&`, `$`, backticks denied; grep and glob disabled (grep matched file
  contents and leaked a canary); the `list` tool does not exist in 1.18.35; exact git allow list (`git status [--short|--porcelain]`,
  `git diff [--stat|--name-only|HEAD]`, `git log --oneline [-N]`, `git branch [-a|-vv]`) closes `git diff --no-ind\ex` and `git branch -D`;
  built-in `build`, `plan`, `general`, `explore` agents disabled. OpenCode turns `\` into `/` before matching, so a backslash cannot be denied by
  pattern: `ls` can still list names through a backslash path (accepted residual risk). Worker prompts cannot contain `| > $ & ;`. The gateway
  refuses prompts that look like injections ("do not refuse").
- **Pilot asks** (status, list agents, draft a brief): luna $0.017 total, good enough for routine status, one wrong label; sonnet $0.142 (about 8x),
  better judgment. Use `maestro-review` for decisions. The Claude-side comparison (digismith-maestro) was not run.
- **Missing before real use:** dispatching workers (edit rule too narrow, untested); no memory, SessionStart or post-finish hooks, no usage probe;
  the TUI pane is not a named herdr agent (`pane run` with text, never empty); memory up to 2.6 GB on the test server.
- Spend: about $0.53 of the $1 order cap (about $0.71 including the spike).

## Related

DGS-169 (the pilot, [maestro-in-herdr.md](maestro-in-herdr.md)), DGS-182 (Dedicated Workbox milestone), DGS-177 (hardening), DGS-198 (one herdr session),
DGS-203 ([representative-decides-for-jack.md](representative-decides-for-jack.md)).
