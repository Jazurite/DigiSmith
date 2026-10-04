# Run the maestro as a persistent herdr agent on the VPS, with Observer and Operator clients

**Status:** Idea, an exploration by Jack (2026-10-04 11:15 UTC+7 [04:15Z]). No design yet. ClickUp: **DGS-169** (list C.1: Workbox, created 2026-10-04 11:11 UTC+7 [04:11Z], task id `14zcebruqtg`).

**Blocked by DGS-170** (`backlog/brainstorm-the-new-maestro-role.md`): the new role must be brainstormed and defined first (Jack, 2026-10-04).

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
- **Two clients typing into one pane collide.** The Operator needs a lock or a rule: one typist at a time.
- **Memory.** One Claude process either way, so no extra, unless the Desktop maestro runs while the herdr one is tested.

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
