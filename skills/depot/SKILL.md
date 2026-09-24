---
name: depot
description: Provisions and manages machine-wide runtime resources that any consumer repo or plan can rely on without knowing where they live — a sparse clone of DigiSmith's shared packages/ code at ~/.digismith-depot/repo (invoked automatically by digismith:bootstrap/digismith:adopt at the start of ticket work; invoke directly any time to pull the latest changes — e.g. "update my DigiSmith clone"), a shared OpenCode server backing digismith:offload-implementer's opencode-runner dispatches (invoked by offload-implementer itself the first time a task is offloaded; invoke directly any time to stop it — e.g. "stop the OpenCode server"), a local Agentic Bridge proxy repairing kimi-k3's XTML format for TokenReply dispatches (invoked by offload-implementer on every claude-code-runner dispatch; invoke directly any time to stop it — e.g. "stop the agentic bridge"), a stateless Claude Code readiness check backing offload-implementer's claude-code-runner dispatches (invoked by offload-implementer on every such dispatch), and a VPS Session CLI reconnecting to an already-provisioned persistent herdr-managed OpenCode agent on a Hetzner VPS over SSH (invoked directly by the user only — e.g. "connect me to my VPS", "check my VPS status" — never auto-invoked by bootstrap/adopt).
---

# Depot

## Overview

DigiSmith's map item **V**. Manages five independent, machine-wide
runtime resources, each available to anything that needs it, independent
of any single repo, ticket, or plan:

- **The packages/ clone** — a local, minimal, refreshable clone of
  DigiSmith's shared `packages/` code at `~/.digismith-depot/repo`, so any
  consumer repo can run a shared package (e.g. a future `jira-client`)
  without needing to know or maintain a path to one.
- **The OpenCode server** — a single shared `opencode serve` process
  backing every `digismith:offload-implementer` `opencode`-runner
  dispatch across every concurrent `subagent-driven-development` plan on
  the machine, so no plan needs to spin up its own.
- **The Agentic Bridge proxy** — a single shared local HTTP proxy backing
  every `digismith:offload-implementer` `claude-code`-runner dispatch to
  TokenReply, repairing `kimi-k3`'s XTML tool-call format into a real
  `tool_use` block before Claude Code sees it, so a dispatch just works.
- **Claude Code readiness** — a stateless PATH + `--bare`-support check
  backing offload-implementer's `claude-code`-runner dispatches. Unlike
  the other four, nothing is provisioned or reused here — there's no
  process or clone to hold onto, just a check run fresh every dispatch.
- **VPS Session** — reconnects to an already-provisioned, persistent
  herdr-managed OpenCode agent on a Hetzner VPS over SSH (`packages/cli/src/index.ts vps` — published on npm as `@digismith/cli` (map item **V.4**),
  map item **X.1**). Unlike the OpenCode server and Agentic Bridge proxy,
  there is nothing for Depot to spawn or own the lifecycle of — the resource
  being "ensured" is a remote, already-running herdr workspace/agent, not a
  local process tracked by PID.

These resources share nothing but the same shape of idea — available
without the caller needing to know where they live — and are managed by
entirely separate operations below. Depot has no generalized "resource"
abstraction between them: a git clone, two live processes, a stateless
check, and a remote herdr workspace/agent don't share mechanics.

## Resource: packages/ Clone

This skill has no awareness of what's inside `packages/` — it clones the
whole directory as one sparse scope. A consumer package names its own
path underneath (e.g. `packages/jira-client/`); adding a new package
later needs no change here.

### Which Operation

- **Invoked by `digismith:bootstrap`/`digismith:adopt`** (by name, as
  part of their own process) → always `ensure`. Neither skill ever asks
  for `refresh`.
- **Invoked directly by the user, not through those two skills** →
  always `refresh`. `ensure` is not something a person would ever ask
  for by hand — it already runs automatically at the start of every
  ticket's work. A direct request ("update my DigiSmith clone", "pull
  the latest depot", "refresh depot") only ever means bringing an
  existing clone up to date.

### Operation: `ensure` — idempotent, clone-if-missing

```bash
node <digismith-repo>/packages/cli/src/index.ts depot clone ensure
```

Idempotent: a no-op if `~/.digismith-depot/repo/.git` already exists.

### Operation: `refresh` — explicit, on demand

```bash
node <digismith-repo>/packages/cli/src/index.ts depot clone refresh
```

If `~/.digismith-depot/repo` doesn't exist yet when `refresh` is invoked
directly, run `ensure`'s sequence first instead of failing — refreshing
something that was never provisioned isn't a real error case, just an
ordering one. The sparse-checkout pattern set during `ensure`'s initial clone
persists across the hard reset — never reapply it. Both are now handled
inside `clone.ts` rather than inline bash.

## Resource: OpenCode Server

A single, shared `opencode serve` process for the whole machine, backing
every `digismith:offload-implementer` dispatch regardless of which
`subagent-driven-development` plan or repo initiated it. OpenCode
sessions are isolated from each other by design (verified live,
repeatedly): a fresh dispatch with no `--session` flag always starts a
new, context-free session no matter what else is running on the server,
and `--dir` is a per-dispatch flag, not a per-server one — so one shared
process correctly serves dispatches against any number of different
worktrees. Tracked at `~/.digismith-depot/opencode-server.json`
(`{"pid": ..., "port": ...}`), sibling to `~/.digismith-depot/repo`.

This skill knows nothing about models, prompts, or Chutes routing beyond
the one credential needed to launch the process (see below) —
`opencode.json`'s provider configuration and the `--model` flag used per
dispatch remain entirely `digismith:offload-implementer`'s concern.

### Which Operation

- **Invoked by `digismith:offload-implementer`**, the first time a task
  is actually offloaded → always `ensure-opencode-server`. Unlike the
  packages/ clone's `ensure`, this is **not** auto-invoked by
  `digismith:bootstrap`/`digismith:adopt` — the server is a real
  background process (346-556MB observed in practice) that exists only
  to serve explicit, opt-in offload dispatches, which most tickets never
  use.
- **Invoked directly by the user** → always `stop-opencode-server`
  ("stop the OpenCode server", "kill the offload server"). Never
  automatic, never tied to any single plan finishing — a shared server
  may still be backing a different plan's in-progress task. There is no
  `refresh-opencode-server`: refreshing a process is just stop-then-ensure,
  not a distinct operation worth naming.

### Operation: `ensure-opencode-server` — start if not alive

```bash
node <digismith-repo>/packages/cli/src/index.ts depot opencode ensure
```

Checks the tracked server first (`~/.digismith-depot/opencode-server.json`) and returns its
port if still alive; otherwise starts a fresh `opencode serve` process (fetching the Chutes API
key the same way as before), confirms the real PID of whatever is listening via `netstat` (not
`ps -W`/`awk` — see `packages/cli/src/depot/process-lifecycle.ts`, which now owns all PID
resolution and works from any Windows shell, not just Git Bash), and persists the tracking file.

### Operation: `stop-opencode-server` — explicit only

```bash
node <digismith-repo>/packages/cli/src/index.ts depot opencode stop
```

Reports "nothing to stop" plainly if no server is tracked; otherwise tree-kills the tracked
process and deletes the tracking file.

## Resource: Agentic Bridge Proxy

A single, shared local HTTP proxy (map item **K.9**, `scripts/agentic-bridge/server.ts`)
backing every `digismith:offload-implementer` `claude-code`-runner dispatch to TokenReply —
it repairs `kimi-k3`'s leaked XTML tool-call format into a real `tool_use` block before
Claude Code ever sees it, so a single ordinary dispatch just works. See
`.digismith/docs/agentic-bridge/design.html`. Tracked at
`~/.digismith-depot/agentic-bridge.json` (`{"pid": ..., "port": ...}`), sibling to
`~/.digismith-depot/repo` and `~/.digismith-depot/opencode-server.json`.

This skill knows nothing about TokenReply's response shape, XTML, or tool-call formats
beyond running the CLI that already knows all of that — entirely
`digismith:offload-implementer`'s (and the proxy's own) concern.

### Which Operation

- **Invoked by `digismith:offload-implementer`**, every `claude-code`-runner dispatch (not
  just the first — same as `ensure-claude-code`, this call is cheap once the server is
  already running: a tracked-file read plus one liveness check) → always
  `ensure-agentic-bridge`.
- **Invoked directly by the user** → always `stop-agentic-bridge` ("stop the agentic
  bridge", "kill the kimi-k3 proxy"). Never automatic, never tied to any single plan
  finishing — a shared server may still be backing a different plan's in-progress
  dispatch. There is no `refresh-agentic-bridge`: refreshing a process is just
  stop-then-ensure, not a distinct operation worth naming.

### Operation: `ensure-agentic-bridge` — start if not alive

```bash
node <digismith-repo>/packages/cli/src/index.ts depot bridge ensure
```

`<digismith-repo>` is the same path this skill already resolves for its own invocation; the CLI
also resolves it itself from `cwd` when run from inside a checkout, or accepts an explicit
override: `node <digismith-repo>/packages/cli/src/index.ts depot bridge ensure --repo
<digismith-repo>`. Otherwise behaves the same as before: checks the tracked proxy first,
otherwise starts `scripts/agentic-bridge/server.ts` fresh, confirms the real PID via `netstat`,
and persists the tracking file.

### Operation: `stop-agentic-bridge` — explicit only

```bash
node <digismith-repo>/packages/cli/src/index.ts depot bridge stop
```

Reports "nothing to stop" plainly if no proxy is tracked.

## Resource: Claude Code Readiness

A **stateless readiness check** for `digismith:offload-implementer`'s
`claude-code` runner branch — unlike the OpenCode server, `claude -p`
spawns fresh per dispatch and needs no warm server, so there is no
process, pid, or port to track here, and no `~/.digismith-depot/*.json`
tracking file at all.

### Which Operation

- **Invoked by `digismith:offload-implementer`**, every time a task is
  dispatched via the `claude-code` runner (not just the first — there's
  no persistent state to reuse across dispatches, so this check runs
  every time).

### Operation: `ensure-claude-code` — stateless readiness check

```bash
claude --version >/dev/null 2>&1 && claude -p --help 2>&1 | grep -q -- "--bare"
```

**Exit 0** → `claude` is on PATH and supports `--bare`; return ready.
**Non-zero exit** → not ready (see Error Handling).

## Resource: VPS Session

The `vps` command group of DigiSmith's CLI (`packages/cli/src/index.ts`, map items **X.1**
and **V.4**) that reconnects to an
already-provisioned, persistent herdr-managed OpenCode agent on a Hetzner VPS over SSH. See
`.digismith/docs/X/X.1-vps-session-herdr/design.html`. Config lives at `~/.digismith-depot/vps.json`
(`{"host", "user", "identity_file", "workspace_label", "agent_name"}`), sibling to Depot's other
state files — written by hand, no creation/edit tooling.

From a checkout the commands below run via `node <digismith-repo>/packages/cli/src/index.ts`;
with the package installed globally (`pnpm add -g @digismith/cli`) the same thing is
`digismith vps status|connect` or `dg vps status|connect`. `status` works from any directory.
`connect` does too once the VPS's `opencode.json` already has a working `tokenreply` provider,
which is the common case; on first-time setup, or when repairing a missing/malformed provider,
it needs a DigiSmith checkout — run it from inside one, or pass `--repo <path>` — because it
generates the provider block with that checkout's `scripts/providers/print-config.ts`, which
the published package doesn't ship. This skill always uses the checkout form — a Claude Code
session driving Depot has one — and never depends on the package being installed.

Unlike the OpenCode server and Agentic Bridge proxy, there is nothing for this skill to spawn
or track by PID: the resource being "ensured" is a remote, already-running herdr
workspace/agent, not a local process.

### Which Operation

- **Invoked directly by the user, by name or by asking a Claude Code session** ("connect me to
  my VPS", "check my VPS status") → `status` (a pure read, never modifies anything) or
  `connect` (auto-fixes what's safely fixable, then attaches) depending on intent.
- **Never auto-invoked by `digismith:bootstrap`/`digismith:adopt`** — unlike the packages/
  clone, this is not a per-ticket dependency most tickets need.

### Operation: `status`

```bash
node <digismith-repo>/packages/cli/src/index.ts vps status
```

Reports each check plainly: SSH reachability, whether herdr itself is installed, whether
herdr's server is running, toolchain-on-PATH (node/pnpm/opencode), whether the configured herdr
agent is alive and OpenCode is running in it (both read from the same `herdr agent get
<agent_name>` call — herdr drops an agent's name registration when its OpenCode process dies,
so a surviving pane with dead OpenCode reports both as FAIL rather than as a separate state),
and whether the TokenReply credential file is present. Never modifies anything on the VPS.

### Operation: `connect`

```bash
node <digismith-repo>/packages/cli/src/index.ts vps connect
```

Runs the same checks as `status`, auto-fixing what's safely fixable — starting herdr's server
if it's down (and confirming it actually came up, showing its log if not), creating the herdr
workspace/agent (installing herdr's OpenCode integration plugin first if not already
installed) if missing or dead, and, when `~/.config/opencode/opencode.json` on the VPS has no
`tokenreply` entry under its top-level `provider` key, merging one in (keeping any other
settings and providers already there) via DigiSmith's own `scripts/providers/print-config.ts`
— then attaches interactively.

The TokenReply credential (`~/.config/tokenreply.env` on the VPS) is a plain API key, not
`claude`'s OAuth login, so unlike the old tmux/`claude` setup this step **is** automatable: if
the file is missing on the VPS, `connect` copies the key straight from the local
`~/.digismith-depot/.env`, write-locally-then-`scp`, then restricts it to mode 600 — never
interpolated into a quoted SSH string. Only when the key is missing on both sides does
`connect` stop and report; there's nothing to copy. When `connect` creates the herdr
workspace, the remote shell sources that file itself and hands the key to the workspace via
herdr's `--env`, so OpenCode's `{env:TOKENREPLY_API_KEY}` provider option resolves — the key
never passes through the local command line. Never auto-installs a missing toolchain piece (nvm/node/pnpm/opencode/herdr) —
same disposition Depot already takes for a missing local `opencode`/`claude`.

`connect`'s final step is an interactive `ssh -t ... herdr agent attach <agent_name>` that needs
a real controlling terminal. Run it from a proper console (Windows Terminal, PowerShell, cmd, or
a macOS/Linux terminal) — not from an agent's Bash tool, and not from MinTTY-based Git Bash
without `winpty`, where `ssh -t` cannot allocate a pseudo-terminal and the attach fails with
"not a terminal". `status` has no such requirement and works from anywhere.

## Error Handling

| Case | Disposition |
|---|---|
| No SSH access / key not authorized for `git@github.com:Jazurite/DigiSmith.git` | Report the actual git error plainly. No retry, no fallback to an unauthenticated clone attempt. |
| Network unreachable / GitHub unreachable | Report the actual git error plainly. |
| `ensure` fails when called from `digismith:bootstrap`/`digismith:adopt` | Fail the whole ticket-start flow — report the error, do not proceed to the next step of whichever skill called it. |
| `refresh` invoked directly and it fails | Report the error; leave the existing clone exactly as it was — a failed `fetch` never reaches `reset --hard`, so nothing is left half-updated. |
| `opencode` not on PATH | Stop, tell the caller plainly, point at `pnpm add -g --allow-build=opencode-ai opencode-ai` (plain `pnpm add -g opencode-ai` alone installs a broken binary — pnpm skips postinstall scripts by default). Don't attempt to install it silently. |
| `claude` not on PATH, or doesn't support `--bare` | Stop, tell the caller plainly, point at `npm install -g @anthropic-ai/claude-code`. Never auto-install. |
| Server fails to start (no "listening on" line in the log within a few seconds) | Stop, show the log content, don't retry silently. |
| Tracked PID in `~/.digismith-depot/opencode-server.json` is no longer running | Treat as stale, start fresh per `ensure-opencode-server` above, overwrite the tracking file. |
| Agentic Bridge fails to start (no "listening on" line in `~/.digismith-depot/agentic-bridge.log` within a few seconds) | Stop, show the log content, don't retry silently. |
| Tracked PID in `~/.digismith-depot/agentic-bridge.json` is no longer running | Treat as stale, start fresh per `ensure-agentic-bridge` above, overwrite the tracking file. |
| `netstat -ano` can't confirm a PID listening on the expected port | Never persist an unconfirmed pid — `depot opencode ensure`/`depot bridge ensure` exit 1 and report the failure plainly rather than writing an unusable tracking file. |
| `~/.digismith-depot/vps.json` absent | Both VPS Session commands stop immediately with a plain "no VPS configured, create the file" message. Neither guesses a host. |
| VPS SSH unreachable (timeout, refused, key rejected, or no local `ssh` binary) | Report the actual error plainly. No retry. `connect` attempts nothing further. |
| herdr not installed on the VPS | Stop, point at herdr's own installer (`curl -fsSL https://herdr.dev/install.sh \| sh`). Never auto-install. |
| nvm/node/pnpm/opencode missing on the VPS | Stop, report exactly which piece is missing, point at the manual install steps. Never auto-install — same stance as the local `opencode`/`claude` rows above. |
| herdr server fails to start | Stop, show the log content, don't retry silently. |
| Herdr workspace/agent recreated but OpenCode immediately crash-loops | The herdr pane survives OpenCode dying (confirmed live), but the agent's name registration does not — `herdr agent get <agent_name>` returns `agent_not_found`. So the next `connect` sees the agent as not alive and recreates it (currently in a brand-new workspace, leaving the old pane orphaned — see `backlog/vps-connect-workspace-dedup-x1.md`); it never attaches to a dead session. A raw `herdr agent attach <agent_name>` run by hand, bypassing `connect`, fails with `agent_not_found`. `status` reports the agent/OpenCode checks as FAIL with herdr's own error as the detail. |
| TokenReply credential file absent on the VPS | `connect` auto-fixes it by copying the key from the local `~/.digismith-depot/.env`; absent on both sides is a stop, not a warning — nothing to auto-copy. |
| `opencode.json` write to the VPS fails | Report the actual error plainly, don't silently continue as if it succeeded. |

## Out of Scope

- **Credential management** — entirely outside this skill for the
  packages/ clone side. `~/.digismith-depot/.env` may live in the same parent
  folder, but this skill never creates, reads, or references it — that
  belongs only to Jira-specific skills. The OpenCode server side is a
  narrow, deliberate exception: `ensure-opencode-server` fetches the
  Chutes API key only to pass it as an environment variable at
  server-launch time, and stores, inspects, or manages nothing about it
  afterward.
- **Auto-refresh on every `ensure` call** — deliberately not done, to
  avoid a network round-trip at the start of every single ticket.
- **Per-package logic** — this skill has no knowledge of what's inside
  `packages/`, and never will; a consumer's own path underneath is its
  own concern.
- **Locking `ensure-opencode-server`'s check-then-start against a
  concurrent caller** — two sessions calling it within the same few
  seconds, both finding no tracked server, can each start their own
  `opencode serve` process; whichever writes
  `~/.digismith-depot/opencode-server.json` last wins the tracking slot, and
  the other's process leaks untracked. Accepted for the same reason as
  the shared-stop risk above — a personal, single-operator tool doesn't
  warrant a lockfile/mutex for a window this narrow — but disclosed
  explicitly rather than left as a silent gap.
- **Locking `ensure-agentic-bridge`'s check-then-start against a concurrent caller** —
  same accepted, disclosed risk as `ensure-opencode-server` above: two sessions calling it
  within the same few seconds can each start their own proxy process; whichever writes
  `~/.digismith-depot/agentic-bridge.json` last wins the tracking slot, the other leaks
  untracked. Not solved here, for the same reason.
- **Reference-counted or multi-consumer-safe stop** — `stop-opencode-server`
  is explicit-only, same as the clone never auto-deletes itself. If
  another plan is still relying on the server when it's stopped, that
  plan's next dispatch or fix-round surfaces the existing "captured
  sessionID no longer resolves" case and re-runs `ensure-opencode-server`
  to get a fresh one — annoying, not destructive, and not solved here.
- **Model or provider abstraction** — this skill knows nothing about
  Kimi, Chutes routing, or `opencode.json`'s provider block. Entirely
  `digismith:offload-implementer`'s concern.
- **A generalized multi-resource interface** — five concrete resources
  (one of them stateless, one a remote herdr workspace/agent), five concrete operation sets. OpenCode server and Agentic Bridge
  share the identical ensure/stop + PID/port-tracking lifecycle shape; now that both are real,
  tested TypeScript (`packages/cli/src/depot/process-lifecycle.ts`, map item **V.5**) rather than
  duplicated skill prose, that shape is consolidated into one shared helper instead of being
  copy-pasted twice.

## Quick Reference

| Resource | Operation | When | Effect |
|---|---|---|---|
| packages/ clone | `ensure` | Called by `digismith:bootstrap`/`digismith:adopt` | Runs `depot clone ensure` — clone if missing, else no-op |
| packages/ clone | `refresh` | User asks directly, any time | Runs `depot clone refresh` — fetch + hard reset to `origin/main` (runs `ensure` first if the clone doesn't exist yet) |
| OpenCode server | `ensure-opencode-server` | Called by `digismith:offload-implementer`, first offload in a session | Runs `depot opencode ensure` — start if not alive, else return the tracked port |
| OpenCode server | `stop-opencode-server` | User asks directly, any time | Runs `depot opencode stop` — stop the server and delete the tracking file (no-op if absent) |
| Agentic Bridge proxy | `ensure-agentic-bridge` | Called by `digismith:offload-implementer`, every `claude-code`-runner dispatch | Runs `depot bridge ensure` — start if not alive, else return the tracked port |
| Agentic Bridge proxy | `stop-agentic-bridge` | User asks directly, any time | Runs `depot bridge stop` — stop the proxy and delete the tracking file (no-op if absent) |
| Claude Code readiness | `ensure-claude-code` | Called by `digismith:offload-implementer`, every `claude-code`-runner dispatch | Stateless PATH + `--bare`-support check, no state written |
| VPS Session | `status` | User asks directly, any time | Read-only report of every check above |
| VPS Session | `connect` | User asks directly, any time | Auto-fixes what's safely fixable, then attaches interactively |
