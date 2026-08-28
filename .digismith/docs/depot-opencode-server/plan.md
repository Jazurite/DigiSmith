# Depot: OpenCode Server Management (V.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move K.2's (`digismith:offload-implementer`) OpenCode server lifecycle management under V (`digismith:depot`) as a second machine-wide managed resource, changing its scope from one server per `subagent-driven-development` plan to one shared server for the whole machine.

**Architecture:** `digismith:depot` gains two new operations (`ensure-opencode-server`, `stop-opencode-server`) that own everything about starting, tracking, and stopping a single shared `opencode serve` process at `~/.digismith/opencode-server.json`. `digismith:offload-implementer`'s own server-lifecycle code (its old Step 2 and its "Stop the Server" section) is deleted and replaced with a call out to Depot; everything else in that skill (per-worktree `opencode.json`, task-brief building, dispatch, status extraction, fix loop) is untouched.

**Tech Stack:** Markdown skill files (prose instructions, not executable code) for both `digismith:depot` and `digismith:offload-implementer`; Bash for the actual server-lifecycle commands (`opencode serve`, `tasklist`/`taskkill` on Windows); a disposable Python/pytest scratch repo for live end-to-end verification, same shape as K.2's own original dogfood.

**Spec:** `.digismith/docs/depot-opencode-server/design.html` (also published at https://claude.ai/code/artifact/2cef046b-5e0e-4182-8705-f49c654693dd)

## Global Constraints

- The OpenCode server tracking file is exactly `~/.digismith/opencode-server.json` — sibling to Depot's existing `~/.digismith/repo`, per the spec's Scope Change section.
- `ensure-opencode-server` is **never** auto-invoked by `digismith:bootstrap`/`digismith:adopt` — only `digismith:offload-implementer` calls it, the first time a task is actually offloaded. This is a deliberate asymmetry with the packages/ clone's `ensure`, per the spec.
- `stop-opencode-server` is **explicit only** — never automatic, never tied to any single plan finishing. No reference-counting or multi-consumer-safety check before stopping (accepted risk, per the spec's Accepted Risk section).
- The Windows WINPID-resolution logic (`ps -W`/`awk` primary path, `netstat -ano` fallback, never persist an empty pid) must be preserved **verbatim** from `digismith:offload-implementer`'s current Step 2 — it's already proven correct in a real end-to-end smoke test (2026-08-28); this plan relocates it, it does not rewrite it.
- Depot's existing packages/-clone behavior (`ensure`/`refresh`) is unchanged by this plan — every existing line of that behavior stays exactly as it is today.
- No model/provider knowledge is added to Depot — it fetches exactly one credential (`CHUTES_API_KEY`, via the existing `manage_credentials.py get --field api_key` command) only to pass it as an environment variable at server-launch time, and touches nothing else about Chutes, Kimi, or `opencode.json`.
- No DigiSmith CLI entry point, no generalized multi-resource interface inside Depot beyond these two concrete operation pairs — both explicitly out of scope per the spec.

---

### Task 1: Depot gains OpenCode server management

**Files:**
- Modify: `skills/depot/SKILL.md` (full rewrite — every section changes to cover two resources instead of one)

**Interfaces:**
- Consumes: nothing from other tasks in this plan.
- Produces: two operations later tasks invoke via the `Skill` tool with `skill: "digismith:depot"`:
  - `ensure-opencode-server` — invoked with `args` describing the intent (e.g. `"ensure-opencode-server — an OpenCode dispatch is about to happen"`). Depot's response text states the port the server is listening on (e.g. `"...returns the port"` — the implementer reads the port out of Depot's own reply, same as any other skill invocation in this codebase; there is no typed return value, since this is a prose-instruction skill, not a function call).
  - `stop-opencode-server` — invoked with `args` describing the intent (e.g. `"stop-opencode-server"`). Depot's response text confirms the server was stopped, or that there was nothing to stop.
  - Tracking file `~/.digismith/opencode-server.json` with shape `{"pid": <int>, "port": <int>}` — later tasks may read this directly to confirm Depot's own bookkeeping, but must always go through the two operations above rather than reimplementing server-lifecycle logic themselves.

- [ ] **Step 1: Read the current file in full**

Read `skills/depot/SKILL.md`. Confirm it currently has exactly one resource (the packages/ clone) with two operations (`ensure`, `refresh`), an `## Error Handling` table with 4 rows, an `## Out of Scope` list, and a `## Quick Reference` table with 2 rows. If the actual file differs from this shape, stop and report the discrepancy rather than proceeding — the replacement below assumes this starting shape.

- [ ] **Step 2: Replace the entire file**

Replace the full content of `skills/depot/SKILL.md` with:

```markdown
---
name: depot
description: Provisions and manages two machine-wide runtime resources that any consumer repo or plan can rely on without knowing where they live — a sparse clone of DigiSmith's shared packages/ code at ~/.digismith/repo (invoked automatically by digismith:bootstrap/digismith:adopt at the start of ticket work; invoke directly any time to pull the latest changes — e.g. "update my DigiSmith clone"), and a shared OpenCode server backing digismith:offload-implementer's Chutes-hosted dispatches (invoked by offload-implementer itself the first time a task is offloaded; invoke directly any time to stop it — e.g. "stop the OpenCode server").
---

# Depot

## Overview

DigiSmith's map item **V**. Manages two independent, machine-wide
runtime resources, each provisioned once and reused by anything that
needs it, independent of any single repo, ticket, or plan:

- **The packages/ clone** — a local, minimal, refreshable clone of
  DigiSmith's shared `packages/` code at `~/.digismith/repo`, so any
  consumer repo can run a shared package (e.g. a future `jira-client`)
  without needing to know or maintain a path to one.
- **The OpenCode server** — a single shared `opencode serve` process
  backing every `digismith:offload-implementer` dispatch across every
  concurrent `subagent-driven-development` plan on the machine, so no
  plan needs to spin up its own.

These two resources share nothing but the same shape of idea — provision
once, reuse everywhere — and are managed by entirely separate operations
below. Depot has no generalized "resource" abstraction between them: a
git clone and a live process don't share mechanics.

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
CHUTES_API_KEY=$(python3 ~/.claude/skills/chutes-ai/scripts/manage_credentials.py get --field api_key) opencode serve --port 0 --hostname 127.0.0.1 > ~/.digismith/opencode-server.log 2>&1 &
SERVER_PID=$!
sleep 2
```

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

## Error Handling

| Case | Disposition |
|---|---|
| No SSH access / key not authorized for `git@github.com:Jazurite/DigiSmith.git` | Report the actual git error plainly. No retry, no fallback to an unauthenticated clone attempt. |
| Network unreachable / GitHub unreachable | Report the actual git error plainly. |
| `ensure` fails when called from `digismith:bootstrap`/`digismith:adopt` | Fail the whole ticket-start flow — report the error, do not proceed to the next step of whichever skill called it. |
| `refresh` invoked directly and it fails | Report the error; leave the existing clone exactly as it was — a failed `fetch` never reaches `reset --hard`, so nothing is left half-updated. |
| `opencode` not on PATH | Stop, tell the caller plainly, point at `pnpm add -g --allow-build=opencode-ai opencode-ai` (plain `pnpm add -g opencode-ai` alone installs a broken binary — pnpm skips postinstall scripts by default). Don't attempt to install it silently. |
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
- **Reference-counted or multi-consumer-safe stop** — `stop-opencode-server`
  is explicit-only, same as the clone never auto-deletes itself. If
  another plan is still relying on the server when it's stopped, that
  plan's next dispatch or fix-round surfaces the existing "captured
  sessionID no longer resolves" case and re-runs `ensure-opencode-server`
  to get a fresh one — annoying, not destructive, and not solved here.
- **Model or provider abstraction** — this skill knows nothing about
  Kimi, Chutes routing, or `opencode.json`'s provider block. Entirely
  `digismith:offload-implementer`'s concern.
- **A generalized multi-resource interface** — two concrete resources,
  two concrete operation pairs. Not generalized until a third real
  resource needs the same shape.

## Quick Reference

| Resource | Operation | When | Effect |
|---|---|---|---|
| packages/ clone | `ensure` | Called by `digismith:bootstrap`/`digismith:adopt` | Clone if missing, else no-op |
| packages/ clone | `refresh` | User asks directly, any time | Fetch + hard reset to `origin/main` (runs `ensure` first if the clone doesn't exist yet) |
| OpenCode server | `ensure-opencode-server` | Called by `digismith:offload-implementer`, first offload in a session | Start if not alive (resolving the real Windows PID), else return the tracked port |
| OpenCode server | `stop-opencode-server` | User asks directly, any time | `taskkill` the tracked pid, delete the tracking file (no-op if absent) |
```

- [ ] **Step 3: Verify `ensure-opencode-server` and `stop-opencode-server` standalone**

This is a live behavioral test, not a unit test — `SKILL.md` is a prose
instruction file, not executable code, so "testing" it means literally
following its new instructions by hand and confirming the real-world
result, the same way K.2's own SKILL.md was verified before shipping.

Run these commands directly (following exactly what the new
`ensure-opencode-server` section above says to do):

```bash
rm -f ~/.digismith/opencode-server.json ~/.digismith/opencode-server.log
CHUTES_API_KEY=$(python3 ~/.claude/skills/chutes-ai/scripts/manage_credentials.py get --field api_key) opencode serve --port 0 --hostname 127.0.0.1 > ~/.digismith/opencode-server.log 2>&1 &
SERVER_PID=$!
sleep 2
cat ~/.digismith/opencode-server.log
```

Expected: a line `opencode server listening on http://127.0.0.1:<port>`.
Extract `<port>`.

```bash
WINPID=$(ps -W | awk -v p="$SERVER_PID" '$1==p {print $4}')
echo "WINPID: $WINPID"
tasklist //FI "PID eq $WINPID"
```

Expected: `$WINPID` is non-empty, and `tasklist` shows `opencode.exe`
with that PID. If `$WINPID` came back empty, fall back to
`netstat -ano | grep ":<port>" | grep LISTENING` and take the PID from
its last column instead — confirm this fallback path also works by
temporarily blanking `SERVER_PID` before running the `awk` lookup, to
force the fallback branch.

```bash
echo "{\"pid\": $WINPID, \"port\": <port>}" > ~/.digismith/opencode-server.json
cat ~/.digismith/opencode-server.json
```

Expected: valid JSON with the real pid and port.

**Idempotency check** — re-run the "is it alive" check from
`ensure-opencode-server` (read the tracking file, `tasklist //FI "PID eq
<pid>"`) and confirm it reports the process as alive and would return
the *same* port without starting a second `opencode serve` process.
Confirm via `tasklist //FI "IMAGENAME eq opencode.exe"` that only one
`opencode.exe` process exists at this point.

**Stop check:**

```bash
taskkill //PID $WINPID //F
rm -f ~/.digismith/opencode-server.json
tasklist //FI "IMAGENAME eq opencode.exe"
```

Expected: `taskkill` reports success, and the final `tasklist` shows no
`opencode.exe` process.

**Stop-when-absent check** — with the tracking file already gone, follow
`stop-opencode-server`'s "Absent" branch by hand and confirm it reports
plainly that there's nothing to stop, rather than erroring.

If any of these checks fail, fix the corresponding section of
`skills/depot/SKILL.md` and re-run the failing check before proceeding —
do not commit instructions that don't match what was actually observed.

- [ ] **Step 4: Commit**

```bash
git add skills/depot/SKILL.md
git commit -m "feat(depot): add OpenCode server management (V.1)"
```

---

### Task 2: offload-implementer delegates server lifecycle to Depot

**Files:**
- Modify: `skills/offload-implementer/SKILL.md`

**Interfaces:**
- Consumes: `digismith:depot`'s `ensure-opencode-server` and `stop-opencode-server` operations from Task 1 (invoked via the `Skill` tool with `skill: "digismith:depot"`, per Task 1's Interfaces block).
- Produces: nothing new — this task only removes and rewires existing behavior; every other skill's use of `digismith:offload-implementer` (its own trigger conditions, task-brief/report-file conventions) is unchanged.

- [ ] **Step 1: Read the current file in full**

Read `skills/offload-implementer/SKILL.md`. Confirm it currently has a
`### Step 0: Determine Intent` that branches to a `### Stop the Server`
section, a `### Step 2: Locate or Start the OpenCode Server` section, a
`### Stop the Server` section (top-level, after Step 6), an
`## Error Handling` list with 8 bullets, and a `## Quick Reference`
table with 8 rows (7 numbered steps plus a final `—` row for Stop). If
the actual file differs from this shape, stop and report the discrepancy
before proceeding.

- [ ] **Step 2: Edit `### Step 0: Determine Intent`**

Replace:

```markdown
### Step 0: Determine Intent

**"Stop offloaded work for this plan"** (or equivalent) → skip to Stop
the Server, below. **Otherwise** → this is a dispatch (fresh task or fix
round); continue to Step 1.
```

With:

```markdown
### Step 0: Determine Intent

**"Stop offloaded work"** (or equivalent) → this skill no longer stops
anything itself. The OpenCode server is shared machine-wide by
`digismith:depot` now, not owned per-plan — tell the user to invoke
`digismith:depot`'s `stop-opencode-server` operation directly if they
want it stopped, since another plan may still be relying on it.
**Otherwise** → this is a dispatch (fresh task or fix round); continue to
Step 1.
```

- [ ] **Step 3: Replace `### Step 2: Locate or Start the OpenCode Server`**

Replace the entire section (from `### Step 2: Locate or Start the
OpenCode Server` up to, but not including, `### Step 3: Build the Task
Prompt`) with:

```markdown
### Step 2: Ensure the OpenCode Server Is Running

Invoke `digismith:depot`'s `ensure-opencode-server` operation and use
the port it returns for every dispatch below. This server is shared
machine-wide across every concurrent `subagent-driven-development` plan
on this machine, not scoped to this one — Depot owns starting it,
tracking its PID and port, and all the Windows-specific WINPID
resolution that requires, entirely on its own. This skill no longer
tracks a server itself.

```

- [ ] **Step 4: Delete the `### Stop the Server` section entirely**

Delete this whole section (it currently sits after Step 6, immediately
before `## Error Handling`):

```markdown
### Stop the Server

Read `<workspace>/opencode-server.json`. **Absent** → nothing to stop,
report that plainly. **Present** →

```bash
taskkill //PID <pid> //F
```

then delete `<workspace>/opencode-server.json`. If the file's PID is
already dead (process gone), still delete the tracking file — nothing
to kill, but stale state should not survive.
```

Nothing replaces it — `## Error Handling` becomes the next content
immediately after Step 6's own content.

- [ ] **Step 5: Edit `## Error Handling`**

Remove these three bullets entirely (they move to `digismith:depot`,
which now owns server-lifecycle failures):

```markdown
- **`opencode` not on PATH** → stop, tell the user plainly, point at the
  `pnpm add -g --allow-build=opencode-ai opencode-ai` install command.
  Don't attempt to install it silently.
- **Server fails to start** (no "listening on" line in the log within a
  few seconds) → stop, show the log content, don't retry silently.
```

and:

```markdown
- **`opencode-server.json` names a PID that's no longer running** (e.g.
  the machine restarted, or the process was killed outside this skill)
  → treat as stale, start a fresh server per Step 2, overwrite the
  tracking file.
```

Replace the final bullet:

```markdown
- **A captured `sessionID` no longer resolves on the server** (e.g. the
  server itself was restarted between the original attempt and a fix
  round) → report this plainly rather than silently starting a fresh,
  context-less session under the same session ID assumption — the fix
  round would silently lose all prior context otherwise.
```

With:

```markdown
- **A captured `sessionID` no longer resolves on the server** (e.g.
  someone ran `digismith:depot`'s `stop-opencode-server` — possibly for a
  different plan entirely, since the server is now shared machine-wide —
  or the machine itself restarted) → report this plainly rather than
  silently starting a fresh, context-less session under the same session
  ID assumption. Re-run Step 2 (`digismith:depot`'s
  `ensure-opencode-server`) to get a fresh server/port, then re-dispatch
  as a **fresh task**, not a fix round — the old session's context is
  genuinely gone, so resuming it would silently lose all prior context.
```

The remaining four bullets (`opencode run` genuinely errors, the `Bash`
tool's own call times out, a status reply can lie, fix round hits the
round cap) stay exactly as they are, unchanged.

- [ ] **Step 6: Edit `## Quick Reference`**

Replace the whole table:

```markdown
| Step | Action |
|---|---|
| 0 | Determine intent — stop request, or a dispatch (fresh/fix round) |
| 1 | Ensure `opencode.json` exists in the task worktree, ignored via `.git/info/exclude` (never the tracked `.gitignore`) |
| 2 | Locate or start `opencode serve`, tracking PID+port in the SDD workspace (Windows: resolve the real WINPID, falling back to `netstat -ano` if empty — never persist an empty pid) |
| 3 | Invoke `digismith:inject-standards` (Scenario 4), then build the prompt — brief + standards + report contract requiring implement → test → **commit** → report (fresh), or findings + standards + report contract appending to the same report file (fix round) |
| 4 | Capture the prompt into `$PROMPT` via a single-quoted heredoc, then dispatch via `opencode run --attach ... --format json "$PROMPT"` with an explicit ≥300000ms `Bash` timeout, `--session <id>` on fix rounds, events to a `-round<R>`-suffixed file on fix rounds |
| 5 | Extract the final status-contract text (nested at `.part.text`) from the JSON event stream; capture `sessionID` (event-level) only on a fresh task, never re-appended on a fix round |
| 6 | Independently verify a `DONE`/`DONE_WITH_CONCERNS` claim before trusting it, then hand back to the normal `subagent-driven-development` flow — review, fix loop, completion, unmodified |
| — | Stop: `taskkill` the tracked PID, delete the tracking file |
```

With:

```markdown
| Step | Action |
|---|---|
| 0 | Determine intent — a stop request is no longer this skill's concern (tell the user to invoke `digismith:depot`'s `stop-opencode-server` directly), otherwise this is a dispatch (fresh/fix round) |
| 1 | Ensure `opencode.json` exists in the task worktree, ignored via `.git/info/exclude` (never the tracked `.gitignore`) |
| 2 | Invoke `digismith:depot`'s `ensure-opencode-server` operation, use the port it returns — Depot owns starting the shared server, tracking its PID/port, and WINPID resolution entirely |
| 3 | Invoke `digismith:inject-standards` (Scenario 4), then build the prompt — brief + standards + report contract requiring implement → test → **commit** → report (fresh), or findings + standards + report contract appending to the same report file (fix round) |
| 4 | Capture the prompt into `$PROMPT` via a single-quoted heredoc, then dispatch via `opencode run --attach ... --format json "$PROMPT"` with an explicit ≥300000ms `Bash` timeout, `--session <id>` on fix rounds, events to a `-round<R>`-suffixed file on fix rounds |
| 5 | Extract the final status-contract text (nested at `.part.text`) from the JSON event stream; capture `sessionID` (event-level) only on a fresh task, never re-appended on a fix round |
| 6 | Independently verify a `DONE`/`DONE_WITH_CONCERNS` claim before trusting it, then hand back to the normal `subagent-driven-development` flow — review, fix loop, completion, unmodified |
```

- [ ] **Step 7: Verify end-to-end with a live scratch-repo dispatch**

This exercises Task 1's Depot changes and this task's rewiring together,
the same shape of test already proven 2026-08-28 (real linked worktree,
real seeded bug, real Chutes/Kimi dispatch, independent verification).

Set up a disposable scratch repo with a seeded, independently-verified
bug and a linked worktree (linked, not a plain `git init`, so
`.git` is genuinely a file — the exact scenario Step 1's
`git rev-parse --git-path info/exclude` fix targets):

```bash
SCRATCH=/tmp/depot-opencode-smoketest
rm -rf "$SCRATCH-origin" "$SCRATCH-worktree"
mkdir -p "$SCRATCH-origin"
cd "$SCRATCH-origin"
git init -q
git config user.email "jack@jazurite.com"
git config user.name "Jack Huỳnh"
mkdir -p src tests
cat > src/billing.py <<'EOF'
def calculate_total(price, tax_rate):
    """Return price plus tax_rate percent tax."""
    return price + tax_rate
EOF
cat > tests/test_billing.py <<'EOF'
from src.billing import calculate_total

def test_zero_tax():
    assert calculate_total(100, 0) == 100

def test_flat_tax_rate():
    assert calculate_total(50, 100) == 100

def test_ten_percent_tax():
    assert calculate_total(200, 10) == 220
EOF
touch src/__init__.py tests/__init__.py
git add -A
git commit -q -m "seed billing bug for smoke test"
git worktree add -q "$SCRATCH-worktree" -b smoketest-fix
cd "$SCRATCH-worktree"
python3 -m pytest tests/ -v
```

Expected: 2 of 3 tests fail (`test_flat_tax_rate`, `test_ten_percent_tax`) —
this confirms the seeded bug is real before offloading the fix. (This
arithmetic was independently verified with real Python before writing
this plan: `calculate_total(100, 0)` coincidentally matches at 100 either
way; the other two genuinely differ — buggy `150`/`210` vs. correct
`100.0`/`220.0`.)

Follow the **updated** `skills/offload-implementer/SKILL.md` literally,
step by step, from inside `$SCRATCH-worktree`:

1. Step 1 — write `opencode.json`, resolve
   `EXCLUDE_FILE=$(git rev-parse --git-path info/exclude)`, append
   `opencode.json` to it, confirm `git check-ignore -q opencode.json`
   now succeeds.
2. **Step 2 (this task's change)** — invoke `digismith:depot`'s
   `ensure-opencode-server` operation. Confirm it returns a port, and
   confirm `~/.digismith/opencode-server.json` exists with a real pid
   and that port.
3. Step 3 — invoke `digismith:inject-standards` (Scenario 4) for this
   worktree, build the dispatch prompt combining a brief describing the
   `calculate_total` bug (files, problem, fix, acceptance — same shape
   as any other task brief) with the standards output and the fixed
   report contract.
4. Step 4 — dispatch via `opencode run --attach http://127.0.0.1:<port>
   --model chutes/moonshotai/Kimi-K3-TEE --auto --format json --dir
   "$SCRATCH-worktree" "$PROMPT"`, with an explicit ≥300000ms timeout.
5. Step 5 — extract the final status contract from `.part.text` in the
   JSON event stream.
6. Step 6 — independently verify: run `python3 -m pytest tests/ -v`
   yourself (expect 3 passed) and `git log --oneline` yourself (expect a
   real commit) — do not just trust the reported `Status: DONE`.

If the dispatch is killed by a tool-level timeout before finishing (a
real, previously-observed failure mode — see
`skills/offload-implementer/SKILL.md`'s Error Handling), resume the same
session with a longer or backgrounded timeout rather than treating the
timeout itself as a failure.

Then verify the stop path, invoked directly (not through
offload-implementer, since it no longer does this):

```bash
# invoke digismith:depot's stop-opencode-server operation
tasklist //FI "IMAGENAME eq opencode.exe"
```

Expected: `stop-opencode-server` reports success, and the final
`tasklist` shows no `opencode.exe` process, and
`~/.digismith/opencode-server.json` no longer exists.

Clean up the scratch artifacts:

```bash
cd "$SCRATCH-origin"
git worktree remove "$SCRATCH-worktree" --force
git worktree prune
rm -rf "$SCRATCH-origin" "$SCRATCH-worktree"
```

If any step behaves differently than `skills/offload-implementer/SKILL.md`
or `skills/depot/SKILL.md` describe, fix the relevant `SKILL.md` and
re-run the smoke test before proceeding — do not commit or complete this
task on a smoke test that needed a workaround the file doesn't document.

- [ ] **Step 8: Commit**

```bash
git add skills/offload-implementer/SKILL.md
git commit -m "refactor(offload-implementer): delegate server lifecycle to depot (V.1)"
```

---

### Task 3: Update MEMORY.md's map

**Files:**
- Modify: `MEMORY.md`

**Interfaces:**
- Consumes: the shipped state of Tasks 1-2 (this task only documents what already exists on the branch).
- Produces: nothing consumed by later tasks — this is the last task in this plan.

- [ ] **Step 1: Read the current live content first**

Read `MEMORY.md` fresh, in full, immediately before editing — other
concurrent Claude Code sessions may be editing this same file (this
happened repeatedly during I.1/K.2/V's own development). Locate the
current text of row **V** and the **K.2** sub-bullet inside row **K**
before making any edit; if either has changed since this plan was
written, edit the *live* text, not the text quoted below.

- [ ] **Step 2: Edit row V's description**

Find the row starting `| **V** | Runtime clone provisioning |`. Its
current text ends with:

```
... New letter, added directly during the same brainstorm that surfaced the Jira REST migration — pulled forward and built outside any tier, same as **O** and **P**. Shipped: `digismith:depot` skill
```

Append, before the final period-free end of the cell (i.e. append this
sentence to the end of the row's existing text, in the same cell):

```
 · **V.1** (2026-08-28) extends Depot to also manage a second machine-wide resource: a single shared OpenCode server backing every `digismith:offload-implementer` dispatch (previously one server per plan) — Depot now owns starting, tracking, and stopping it via `ensure-opencode-server`/`stop-opencode-server`, mirroring the clone's `ensure`/`refresh` shape.
```

- [ ] **Step 3: Edit K's K.2 sub-bullet**

Find the **K** row's `**K.2**` sub-bullet, which currently ends (inside
row K's cell) with:

```
`digismith:offload-implementer` skill, shipped 2026-08-27. Fresh isolated session per task on a shared server process; failures surface rather than silently falling back to Claude.
```

Replace `on a shared server process` with
`on a server process now managed by **V.1** (`digismith:depot`), shared
machine-wide across every concurrent plan rather than one per plan`.

- [ ] **Step 4: Commit**

```bash
git add MEMORY.md
git commit -m "docs(memory): record V.1 — depot now manages the OpenCode server"
```
