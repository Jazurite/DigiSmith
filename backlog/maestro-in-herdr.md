# Run the maestro as a persistent herdr agent (Mac Workbox), with Observer and Operator clients

**Status:** Idea, an exploration by Jack (2026-10-04 11:15 UTC+7 [04:15Z]). No design yet. ClickUp: **DGS-169** (list C.1: Workbox, created 2026-10-04 11:11 UTC+7 [04:11Z], task id `14zcebruqtg`).

**Blocked by DGS-176** (`backlog/define-the-maestro-role.md`, the head butler) and related to DGS-170 (the Master role, `backlog/brainstorm-the-new-maestro-role.md`): the roles must be defined first (Jack, 2026-10-04).

**Source:** Jack, in the DigiSmith maestro session (voice input, so some words are my reading): "I'm exploring a new role or new way of
working. Right now the maestro is defined as running on the transient local machine, right? How about we move the maestro into the
persistent state on the VPS: it holds all the states, and we use the default herdr session to store all the maestro instances. Our own
local desktop, running Claude Code or OpenCode, becomes an Observer (or Operator): an app that attaches to the maestro. This way we
control the maestro remotely without interfering with it. We can plug in headless and resume the maestro by ourselves. No need for a
separate kicker."

## What exists today (checked 2026-10-04)

- The Desktop maestro (`DigiSmith`, `Emma`, `Soveron`) is a Claude process on the VPS that the Desktop app drives over SSH. Only the
  Desktop session has the app's own tools (`list_sessions`, `get_session`, `send_message`, `clear_session`, the sidebar, artifacts).
- The Flux protocol (DGS-154) rule 6 says: the maestro keeps its seat, a Desktop session on `dev0`, and "running it as a herdr agent is
  ruled out (Jack, 2026-10-03)". This item reopens that rule. Jack is the one who set it.
- A herdr worker pane takes input from outside: `herdr agent prompt <agent> "/exit"` and `"/reload-plugins"` both ran as commands
  (DGS-161 test). `herdr agent start ... --resume <id>` restarts a session. `herdr pane read` reads a pane without typing into it.
- The runbook already has "Attach from any machine" and "Control from a Claude Desktop app on any machine".
- A herdr worker could not wake the Desktop maestro (the kicker run on 2026-10-04: "No agent named 'DigiSmith' is reachable"). Both
  sides being herdr agents may change that. Untested.

## Option B: an OpenCode server as the persistent maestro (Jack, 2026-10-04 11:20 UTC+7, from an OpenCode answer)

Jack pasted OpenCode's own description of the pattern: a persistent backend on the VPS (`opencode serve` or `opencode web`), and a thin
client on the local machine (`opencode attach <url>`, or `opencode run --attach <url> "<prompt>"` for one command). The sessions, files,
tools and context stay on the VPS. When the local TUI exits, the session lives on.

Checked on this VPS (OpenCode 1.18.34): `opencode attach <url>` takes `--session <id>`, `--continue`, `--fork`, and basic auth
(`--username`, `--password`, or `OPENCODE_SERVER_USERNAME` and `OPENCODE_SERVER_PASSWORD`). `opencode serve` listens on `127.0.0.1` unless
told otherwise. We already run this shape for the Sol reviewer (`opencode serve --hostname 127.0.0.1 --port 4097` in a herdr pane, and an
`opencode attach` watch tab).

What B gives that option A (a Claude Code maestro in a herdr pane) does not:

- **Native Observer and Operator.** Any number of clients attach to one session. `opencode run --attach <url> --session <id> "Arise"` is a
  headless kick, so there is no kicker and no `/clear` by tool.
- **No Claude seat quota.** The maestro would run on TokenReply (`kimi-k3` and `kimi-k2.7` were active in Jack's screenshot). This session
  has used most of the `dev0` 5-hour window (73% at 11:09 UTC+7).

What B costs:

- **The model.** `kimi-k3` is unproven as a maestro, and it had tool-calling faults through the Claude Code runner
  (`backlog/tokenreply-kimi-k3-tool-calling-failure.md`). OpenCode's own runner may be fine, as Jack's test showed. **Out of scope here (Jack,
  2026-10-04 11:2x UTC+7): the maestro's review steps** (reading designs, plans and diffs at checkpoints, independent reviews). "Don't
  worry about it, it'll be tackled by another ticket." The closest existing tickets are DGS-127 (Sol as the default reviewer) and DGS-167
  (design review shape). The spike does not judge a model on reviewing.
- **The DigiSmith plugin.** Skills, hooks (the SessionStart banner, the post-finish hooks) and the Skill tool are a Claude Code plugin.
  Whether OpenCode loads them (it can read Claude-style skills) is untested.
- **Security.** `opencode serve` gives whoever reaches it an agent with a shell on the VPS, with the TokenReply key loaded. Never use
  `--hostname 0.0.0.0` on a public address. Keep `127.0.0.1`, set `OPENCODE_SERVER_PASSWORD`, and reach it through an SSH tunnel
  (`ssh -L 4096:127.0.0.1:4096`) and `opencode attach http://localhost:4096` from the desktop.

A mixed shape is possible too: the OpenCode server as the multi-client hub, with the model chosen per task.

## Direction confirmed (Jack's answers on DGS-170, 2026-10-04)

The maestro is **persistent on the VPS** and a Master's session **attaches** to it. Several Masters (anyone with the SSH key) can attach, so
the shape must support several clients: a herdr pane allows one typing client at a time, an OpenCode session takes several. A maestro is
started by a `dg` command.

## Shape decided (Jack's "Yes" on DGS-176, 2026-10-04)

A **Claude Code agent in a herdr pane first** (option A); an OpenCode session is the later experiment (option B). The first persistent maestro
goes live only for a project where an escalating action is low-risk: a throwaway project, then `Soveron`. `Emma` and `DigiSmith` stay
Desktop maestros until DGS-177's stronger channel exists (a pane has no human-only approval channel). This item carries the build: the
`dg` start, stop, renew and list commands, the project registry (DGS-172), the state file, and the pilot. See `backlog/define-the-maestro-role.md`.

## Direction refined (Jack, 2026-10-04 evening, in the DigiSmith maestro session)

- **The herdr session is the project, and the maestro is a permanent agent in it.** Each project's herdr session (`DigiSmith`, `emma`, `Soveron`)
  holds one permanent workspace with one agent named exactly **`maestro`** (generic: the session name carries the project, and the ticket-keyed
  worker names do not apply to a maestro, which has no ticket). Worker workspaces come and go beside it. So "which maestro controls which project"
  is answered by the session name.
- **Both the Master and the maestro use OpenCode** (Jack believes Claude Code has no attach). The Master attaches with `opencode attach`. This
  moves the first-build choice from "a Claude Code agent first, OpenCode later" toward OpenCode. Not yet confirmed as the final choice.
- **No kicker.** With the maestro in herdr, `herdr agent prompt maestro "..."` reaches it from any shell on the VPS, and `opencode run --attach` is a
  headless kick. The notification channel is a separate question, discussed later.

## Spike result (DGS-169 spike worker `dgs-169-spike`, 2026-10-04 21:4x to 21:57 UTC+7; report `69e1665`)

Report: `.digismith/board/DGS-169—run-maestro-as-persistent-herdr/worker-dgs-169-spike/report.md`. Verdict: **yes, with limits.** OpenCode 1.18.34, a
server on `127.0.0.1:4198` with a generated password, one TUI attached, driven only through `herdr`.

- **Works:** `herdr agent start --kind opencode` (ready at once, state read correctly); `herdr agent prompt ... --wait --until done`; `/compact`, `/new` and
  `/exit` sent through `herdr agent prompt` run as real commands (`--wait` returns an error on `/new` and `/exit`, but they still execute: a driver
  must ignore it); the new session id comes back in herdr's own JSON (`agent_session.value`); `opencode run --attach ... --session <id>` reaches a chosen
  session and shows live in the TUI; two clients share one session live and closing one does not disturb the other; the session survives a TUI exit
  and re-attaches with full history (the herdr agent entry does not survive and is re-created with `agent start ... -- attach <url> --session <id>`).
- **`/new` is a full wipe, and "Arise" restores nothing.** After `/new` the model had no memory of a secret word from the note. The renewal driver (a
  script, or `dg`) must read the note and put its content in the prompt it sends after `/new`. This changes the Flux protocol text for a herdr maestro.
- **A session id goes stale after `/new`.** A driver that caches an id writes into an orphaned session. Re-read the id after every renewal.
- **Memory is the real constraint.** `opencode serve` 369 MB, rising to 501 MB after about ten turns; each TUI 235 MB, rising to 319 MB. The VPS had 650
  to 1100 MB available under normal load. A server plus one Operator is about 600 MB or more. Only a 12-minute run: the server's ceiling is unmeasured.
- **No skills.** OpenCode has no loader for the DigiSmith plugin (read-only look, so not proven). The plugin does not come along.
- **Not tested:** the `blocked` state for OpenCode, and a longer run for the memory ceiling.
- **Blocker found on the way (DGS-181):** `dg depot` cannot start or stop an OpenCode server on the Linux VPS, because `process-lifecycle.ts` uses
  `tasklist`, `taskkill` and a Windows `netstat` parser. Jack's rule: Linux first, keep Windows working. DGS-180 fixed the leak it caused.

## The 24/7 use case (Jack, 2026-10-04, from DGS-176)

The maestro will sometimes run **24/7 on the backlog**: tickets that need no Master's permission it does by itself; a ticket that needs a
Master's opinion stops and waits for the answer. The build has to support unattended running: a Master-written permission policy
(default deny), ticket classification, park-and-continue, a waiting-for-Master list and a notification, quota and memory limits,
automatic renewal by a flux, and a decision log. See the Autonomy section of `backlog/define-the-maestro-role.md`.

## What it would change

- **No kicker.** A maestro in herdr is cleared or restarted like a worker (exit, start again with its note, `Arise`), by a script or by
  the Operator. The `kicker` Desktop session, `clear_session`, and Jack's "yes" to "kicker open? flux now?" go away.
- **Reload.** `herdr agent prompt maestro "/reload-plugins"` replaces Jack typing it in each Desktop maestro (DGS-162, idea 2).
- **Persistence.** The maestro survives the laptop closing and the Desktop app restarting. All maestro instances sit in one herdr session
  (`default`, or one named session each).
- **The seat.** The maestro could choose its own account like a worker. Today it is fixed on `dev0`.
- **Observer and Operator.** Observer: read-only (`herdr pane read`), so it cannot interfere. Operator: can type. The desktop could be
  the Claude Desktop app over SSH running `herdr attach`, a Claude Code or OpenCode terminal, or a new small app.

## What it would cost

- **The Desktop-only tools.** Session list and status, message to another session, archive, sidebar, artifacts, scheduled wake-up. Decide
  which the maestro really needs. Most of its work today is the herdr CLI, ClickUp CLI, git and file reads.
- **The chat UI.** Notifications, rendered pages and the remote-control app are Desktop features. A terminal attach is plainer.
- **The Flux protocol.** Section "Maestro flux" (M1 to M7) and rule 6 get rewritten. The Desktop kicker route stays as a fallback.
- **Who sent an order.** A Desktop maestro can tell the user from a peer message. A pane cannot: `herdr agent prompt` is typed input, and
  any process on the VPS (root, like every worker) can send it. The Master's identity must be proven, for example by a signed order
  (see DGS-170, Authority).
- **Two clients typing into one pane collide.** The Operator needs a lock or a rule: one typist at a time.
- **Memory.** One Claude process either way, so no extra, unless the Desktop maestro runs while the herdr one is tested.

## Spike 2 on the Mac Workbox (DGS-169 worker, 2026-10-09 22:25 to 22:32 UTC+7 [15:25 to 15:32Z]) — supersedes "on the VPS" above

Report: `.digismith/board/DGS-169—run-maestro-as-persistent-herdr/worker-dgs-169-spike/report-2.md` (and `report.html`). The Mac has 16 GB, so memory is
no longer the blocker (server 665 to 1005 MB, each TUI about 300 MB, system free 85%). **Works:** `opencode serve` on 127.0.0.1 with a password; two TUIs
on one session, live both ways; a client exit leaves the other working; a server kill and restart keeps the history and the attached client reconnects;
a project-level agent with a bash allowlist denies herdr, `bash -c`, `sh`, `python3`, `rm`, `git push` (slips: `head`/`wc` on secret files, pipes, `>`
redirects: deny by path). **Skills:** OpenCode loads `.claude/skills` and `~/.claude/skills`, not the DigiSmith plugin (no `digismith:*`, no hooks): port them.
**Model test (2026-10-10, `report-4.md`):** TokenReply returned 401 until a project plugin (`work/.opencode/plugins/tokenreply-key.js`, `config` hook, key read from
`.env` in memory only) supplied the key. Then `gpt-5.6-luna` 9 of 9 and `claude-sonnet-5-5` 6 of 6 runs passed, judged by real side effects (about $0.0025 and
$0.0101 per run, total spend about $0.18). Recommendation: adopt OpenCode as the maestro hub, luna first, sonnet fallback, pilot on a low-risk project. The real
attach from the PC is still untested.

## A spike (when memory allows)

A throwaway maestro (option A: a Claude Code agent in herdr `default`; option B: an OpenCode session on a localhost-only `opencode serve`) that reads the runbook and the maestro note (read-only) and proves five things: it takes
`/reload-plugins` and a restart from outside, it exchanges messages with workers, the Desktop app attaches and detaches without
disturbing it, its note and `Arise` resume it after an exit, and the account can be chosen at start. Keep the Desktop maestro until it
passes.

## Open questions

- Which of the Desktop tools does the maestro need? Is a herdr maestro worth losing the chat UI?
- Observer and Operator: one app or two, and how does a second client stay out of the way?
- Does one herdr session hold all maestros, or one session per maestro (today `DigiSmith`, `emma`, `Soveron`)?
- Who restarts a crashed or compacted maestro: a supervisor script, `dg workbox`, or the Operator?
- Does this replace the kicker, or does the kicker stay for a Desktop maestro?

## Related

[herdr-persistent-multiplexer-x.md](herdr-persistent-multiplexer-x.md), [vps-cli-named-herdr-session.md](vps-cli-named-herdr-session.md),
[dg-workbox-package.md](dg-workbox-package.md) (DGS-151), [reload-plugins-after-merge.md](reload-plugins-after-merge.md) (DGS-162),
DGS-154 Flux (rule 6, "Maestro flux"), the runbook sections "Attach from any machine" and "Control from a Claude Desktop app on any machine".
