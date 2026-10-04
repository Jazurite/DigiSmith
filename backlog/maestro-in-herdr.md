# Run the maestro as a persistent herdr agent on the VPS, with Observer and Operator clients

**Status:** Idea, an exploration by Jack (2026-10-04 11:15 UTC+7 [04:15Z]). No design yet. ClickUp: **DGS-169** (list C.1: Workbox, created 2026-10-04 11:11 UTC+7 [04:11Z], task id `14zcebruqtg`).

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

A throwaway maestro in herdr `default` that reads the runbook and the maestro note (read-only) and proves five things: it takes
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
