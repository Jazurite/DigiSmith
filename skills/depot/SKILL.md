---
name: depot
description: Provisions and manages machine-wide runtime resources that any consumer repo or plan can rely on without knowing where they live — a sparse clone of DigiSmith's shared packages/ code at ~/.digismith/repo (invoked automatically by digismith:bootstrap/digismith:adopt at the start of ticket work; invoke directly any time to pull the latest changes — e.g. "update my DigiSmith clone"), a shared OpenCode server backing digismith:offload-implementer's opencode-runner dispatches (invoked by offload-implementer itself the first time a task is offloaded; invoke directly any time to stop it — e.g. "stop the OpenCode server"), and a stateless Claude Code readiness check backing offload-implementer's claude-code-runner dispatches (invoked by offload-implementer on every such dispatch).
---

# Depot

## Overview

DigiSmith's map item **V**. Manages three independent, machine-wide
runtime resources, each available to anything that needs it, independent
of any single repo, ticket, or plan:

- **The packages/ clone** — a local, minimal, refreshable clone of
  DigiSmith's shared `packages/` code at `~/.digismith/repo`, so any
  consumer repo can run a shared package (e.g. a future `jira-client`)
  without needing to know or maintain a path to one.
- **The OpenCode server** — a single shared `opencode serve` process
  backing every `digismith:offload-implementer` `opencode`-runner
  dispatch across every concurrent `subagent-driven-development` plan on
  the machine, so no plan needs to spin up its own.
- **Claude Code readiness** — a stateless PATH + `--bare`-support check
  backing offload-implementer's `claude-code`-runner dispatches. Unlike
  the other two, nothing is provisioned or reused here — there's no
  process or clone to hold onto, just a check run fresh every dispatch.

These resources share nothing but the same shape of idea — available
without the caller needing to know where they live — and are managed by
entirely separate operations below. Depot has no generalized "resource"
abstraction between them: a git clone, a live process, and a stateless
check don't share mechanics.

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
if [ ! -d ~/.digismith/repo/.git ]; then
  mkdir -p ~/.digismith && \
  git clone --filter=blob:none --no-checkout --sparse \
    git@github.com:Jazurite/DigiSmith.git ~/.digismith/repo && \
  git -C ~/.digismith/repo sparse-checkout set packages && \
  git -C ~/.digismith/repo checkout main
fi
```

`~/.digismith/repo/.git` already present → this is a no-op. Nothing
below the existence check runs; no fetch, no reset, no network call at
all.

### Operation: `refresh` — explicit, on demand

If `~/.digismith/repo` doesn't exist yet when `refresh` is invoked
directly, run `ensure`'s sequence above instead of failing — refreshing
something that was never provisioned isn't a real error case, just an
ordering one.

Otherwise:

```bash
git -C ~/.digismith/repo fetch --all --prune --tags -q && \
git -C ~/.digismith/repo checkout main && \
git -C ~/.digismith/repo reset --hard origin/main
```

The sparse-checkout pattern set during `ensure`'s initial clone persists
across this `reset --hard` — never reapply it.

## Resource: OpenCode Server

A single, shared `opencode serve` process for the whole machine, backing
every `digismith:offload-implementer` dispatch regardless of which
`subagent-driven-development` plan or repo initiated it. OpenCode
sessions are isolated from each other by design (verified live,
repeatedly): a fresh dispatch with no `--session` flag always starts a
new, context-free session no matter what else is running on the server,
and `--dir` is a per-dispatch flag, not a per-server one — so one shared
process correctly serves dispatches against any number of different
worktrees. Tracked at `~/.digismith/opencode-server.json`
(`{"pid": ..., "port": ...}`), sibling to `~/.digismith/repo`.

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

Check `~/.digismith/opencode-server.json` for a tracked
`{"pid": ..., "port": ...}`.

**Present** → confirm the process is still alive (Windows:
`tasklist //FI "PID eq <pid>"` and check the output actually lists it,
not just that the command succeeded — an absent PID still exits 0 with
an empty-ish table). **Alive** → return the tracked port, done. **Not
alive** → treat as stale, continue as if the file were absent.

**Absent, or stale** → fetch the Chutes API key and start a fresh
server, letting the OS pick a free port rather than guessing one:

```bash
mkdir -p ~/.digismith
CHUTES_API_KEY=$(python3 ~/.claude/skills/chutes-ai/scripts/manage_credentials.py get --field api_key) opencode serve --port 0 --hostname 127.0.0.1 > ~/.digismith/opencode-server.log 2>&1 &
SERVER_PID=$!
sleep 2
```

`ensure-opencode-server` isn't auto-invoked by `bootstrap`/`adopt` (unlike
the clone's `ensure`), so `~/.digismith` may not exist yet the first time
this runs on a machine — the `mkdir -p` above is required, not
defensive.

Read `~/.digismith/opencode-server.log` for the line `opencode server
listening on http://127.0.0.1:<port>` and extract `<port>` from it —
this is the real assigned port, not something to guess. If that line
isn't present after a few seconds, this is a startup failure (see Error
Handling).

**Windows Git Bash only:** `<pid>` here means the native Windows PID
`tasklist`/`taskkill` operate on — never the MSYS/Cygwin PID a plain `$!`
gives you, which differs (confirmed live: MSYS PID `6140` vs. the WINPID
`24816` `tasklist` actually needed for the same process). Resolve the
real WINPID before persisting or checking any PID:

```bash
WINPID=$(ps -W | awk -v p="$SERVER_PID" '$1==p {print $4}')
```

If `$WINPID` comes back empty (the `ps -W`/`awk` lookup can miss), fall
back to resolving the PID by parsing `netstat -ano` for the process
listening on the captured port instead. Never persist an empty pid — a
tracking file with an unusable pid means nothing could ever stop that
server later. On other platforms `$!` is already the right PID — skip
this lookup there.

On success, write `~/.digismith/opencode-server.json` as
`{"pid": <WINPID on Windows, else SERVER_PID>, "port": <port>}`. Return
the port.

### Operation: `stop-opencode-server` — explicit only

Read `~/.digismith/opencode-server.json`. **Absent** → nothing to stop,
report that plainly. **Present** →

```bash
taskkill //PID <pid> //F
```

then delete `~/.digismith/opencode-server.json`. If the file's PID is
already dead (process gone), still delete the tracking file — nothing
to kill, but stale state should not survive.

## Resource: Claude Code Readiness

A **stateless readiness check** for `digismith:offload-implementer`'s
`claude-code` runner branch — unlike the OpenCode server, `claude -p`
spawns fresh per dispatch and needs no warm server, so there is no
process, pid, or port to track here, and no `~/.digismith/*.json`
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
| Tracked PID in `~/.digismith/opencode-server.json` is no longer running | Treat as stale, start fresh per `ensure-opencode-server` above, overwrite the tracking file. |
| WINPID unresolvable (both `ps -W` and the `netstat -ano` fallback come back empty) | Never persist an empty PID — report the failure plainly rather than writing an unusable tracking file. |

## Out of Scope

- **Credential management** — entirely outside this skill for the
  packages/ clone side. `~/.digismith/.env` may live in the same parent
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
  `~/.digismith/opencode-server.json` last wins the tracking slot, and
  the other's process leaks untracked. Accepted for the same reason as
  the shared-stop risk above — a personal, single-operator tool doesn't
  warrant a lockfile/mutex for a window this narrow — but disclosed
  explicitly rather than left as a silent gap.
- **Reference-counted or multi-consumer-safe stop** — `stop-opencode-server`
  is explicit-only, same as the clone never auto-deletes itself. If
  another plan is still relying on the server when it's stopped, that
  plan's next dispatch or fix-round surfaces the existing "captured
  sessionID no longer resolves" case and re-runs `ensure-opencode-server`
  to get a fresh one — annoying, not destructive, and not solved here.
- **Model or provider abstraction** — this skill knows nothing about
  Kimi, Chutes routing, or `opencode.json`'s provider block. Entirely
  `digismith:offload-implementer`'s concern.
- **A generalized multi-resource interface** — three concrete resources
  (one of them stateless), three concrete operation sets. Not
  generalized until a fourth real resource needs the same shape as an
  existing one.

## Quick Reference

| Resource | Operation | When | Effect |
|---|---|---|---|
| packages/ clone | `ensure` | Called by `digismith:bootstrap`/`digismith:adopt` | Clone if missing, else no-op |
| packages/ clone | `refresh` | User asks directly, any time | Fetch + hard reset to `origin/main` (runs `ensure` first if the clone doesn't exist yet) |
| OpenCode server | `ensure-opencode-server` | Called by `digismith:offload-implementer`, first offload in a session | Start if not alive (resolving the real Windows PID), else return the tracked port |
| OpenCode server | `stop-opencode-server` | User asks directly, any time | `taskkill` the tracked pid, delete the tracking file (no-op if absent) |
| Claude Code readiness | `ensure-claude-code` | Called by `digismith:offload-implementer`, every `claude-code`-runner dispatch | Stateless PATH + `--bare`-support check, no state written |
