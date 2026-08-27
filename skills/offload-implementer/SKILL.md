---
name: offload-implementer
description: Use when explicitly asked to offload a specific subagent-driven-development task to a third-party model instead of a normal Claude implementer — runs the task via a persistent OpenCode server backed by Chutes (Kimi K3).
---

# Offload Implementer

## Overview

DigiSmith's map item **K.2**. Runs one `subagent-driven-development`
task on a Chutes-hosted model via [OpenCode](https://opencode.ai) instead
of a normal Claude implementer subagent, when explicitly asked to offload
that task. The `Agent` tool has no non-Anthropic model routing, so this
isn't a subagent dispatch — the controller itself drives the `opencode`
CLI directly. Explicit per-task only: nothing here runs automatically.

## When to Use

Right when the user asks to offload a specific task while running
`superpowers:subagent-driven-development` — for the task's first attempt,
or (a second, distinct trigger) for a fix round on a task this skill
already dispatched. Also right when the user says offloaded work is done
for the current plan (stop the server).

## Prerequisites

`opencode` on PATH (`pnpm add -g --allow-build=opencode-ai opencode-ai`
if missing — plain `pnpm add -g opencode-ai` alone installs a broken
binary, since pnpm skips postinstall scripts by default). A Chutes API
key available via `python3 ~/.claude/skills/chutes-ai/scripts/manage_credentials.py
get --field api_key`.

## Process

### Step 0: Determine Intent

**"Stop offloaded work for this plan"** (or equivalent) → skip to Stop
the Server, below. **Otherwise** → this is a dispatch (fresh task or fix
round); continue to Step 1.

### Step 1: Ensure `opencode.json` Exists in the Task's Worktree

Check for `opencode.json` in the worktree root. **Present** → continue.
**Missing** → write it:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "chutes": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Chutes",
      "options": {
        "baseURL": "https://llm.chutes.ai/v1",
        "apiKey": "{env:CHUTES_API_KEY}"
      },
      "models": {
        "moonshotai/Kimi-K3-TEE": {
          "name": "Kimi K3 (Chutes)",
          "limit": { "context": 1048576, "output": 65535 }
        }
      }
    }
  }
}
```

Then check whether `.gitignore` in that worktree already ignores
`opencode.json`. If not: read the file's current content first (or note
its absence), ensure it ends in a newline if non-empty, and append a new
line `opencode.json` — an append operation only, never a whole-file
rewrite. This file references your API key only via `{env:CHUTES_API_KEY}`,
never a literal value, but it's still local machine config that
shouldn't be committed.

### Step 2: Locate or Start the OpenCode Server

This plan's SDD workspace is `.superpowers/sdd/<plan-basename>/` (same
directory the ledger lives in). Check for
`<workspace>/opencode-server.json`.

**Present** → read `{"pid": ..., "port": ...}`. Confirm the process is
still alive (on Windows: `tasklist //FI "PID eq <pid>"` and check the
output actually lists it, not just that the command succeeded — an
absent PID still exits 0 with an empty-ish table). **Alive** → reuse
this port, skip to Step 3. **Not alive** → treat as stale, continue as
if the file were absent.

**Absent, or stale** → start a fresh server, letting the OS pick a free
port rather than guessing one:

```bash
CHUTES_API_KEY=$(python3 ~/.claude/skills/chutes-ai/scripts/manage_credentials.py get --field api_key) opencode serve --port 0 --hostname 127.0.0.1 > "<workspace>/opencode-server.log" 2>&1 &
SERVER_PID=$!
sleep 2
```

Read `<workspace>/opencode-server.log` for the line `opencode server
listening on http://127.0.0.1:<port>` and extract `<port>` from it — this
is the real assigned port, not something to guess. If that line isn't
present after a few seconds, this is a startup failure (see Error
Handling).

**Windows Git Bash only:** `$!` gives the MSYS/Cygwin PID, not the native
Windows PID `tasklist`/`taskkill` operate on — the two differ (confirmed
live: MSYS PID `6140` vs. the WINPID `24816` `tasklist` actually needed
for the same process). Resolve the real WINPID before persisting it:

```bash
WINPID=$(ps -W | awk -v p="$SERVER_PID" '$1==p {print $4}')
```

Use `$WINPID` (not `$SERVER_PID`) everywhere below and in the alive-check
and Stop-the-Server steps. On other platforms `$!` is already the right
PID — skip this lookup there.

On success, write `<workspace>/opencode-server.json` as
`{"pid": <WINPID on Windows, else SERVER_PID>, "port": <port>}`.

### Step 3: Build the Task Prompt

**Fresh task (not a fix round):** combine the task's brief (the same
content a normal implementer would receive from `scripts/task-brief`)
with this fixed report contract, appended verbatim:

```
Once you're done (or if you get stuck):

1. Write a full report to <report-file-path>: what you implemented, what
   you tested and the results, files changed, any concerns.
2. Then reply with ONLY this short block:
   Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
   Commits: <short SHA + subject, one per line, or "none">
   Test summary: <one line>
   Concerns: <one line, or "none">
```

`<report-file-path>` is `<workspace>/task-<N>-opencode-report.md`
(mirrors the brief→report naming convention `subagent-driven-development`
already uses for Claude implementers).

**Fix round:** the prompt is the open findings verbatim (not the brief
again — the session already has that context), followed by the same
report-contract block above, with a fresh
`<workspace>/task-<N>-opencode-report-round<R>.md` path.

### Step 4: Dispatch

**Fresh task:**

```bash
opencode run --attach "http://127.0.0.1:<port>" \
  --model chutes/moonshotai/Kimi-K3-TEE --auto --format json \
  --dir "<task-worktree>" "<prompt from Step 3>" > "<workspace>/task-<N>-opencode-events.jsonl"
```

**Fix round**, same command plus `--session "<captured sessionID>"`.

No session flag on a fresh task — confirmed live that this always starts
a new, isolated session on an already-running server, never carrying
context from an earlier call.

### Step 5: Extract the Session ID and the Status Contract

Each line of `<workspace>/task-<N>-opencode-events.jsonl` is one JSON
event. Every event carries a top-level `sessionID` field — take it from
any line (they're all the same session). Record it:

```bash
echo '{"task": <N>, "sessionID": "<extracted id>"}' >> "<workspace>/opencode-sessions.jsonl"
```

The status contract text is in the `text` field of the **last** event
whose `"type":"text"` — that's the model's final reply, matching what
Step 3 asked it to send.

### Step 6: Hand Back to the Normal Flow

Report the same short status contract a normal implementer would, using
what Step 5 extracted. From here, everything is unmodified
`subagent-driven-development`: generate the review package, dispatch the
task reviewer, run the fix loop (resuming via this skill for rounds 1-3,
surfacing per Error Handling if the cap is hit), mark the task complete.
This skill's own job for this dispatch ends here.

### Stop the Server

Read `<workspace>/opencode-server.json`. **Absent** → nothing to stop,
report that plainly. **Present** →

```bash
taskkill //PID <pid> //F
```

then delete `<workspace>/opencode-server.json`. If the file's PID is
already dead (process gone), still delete the tracking file — nothing
to kill, but stale state should not survive.

## Error Handling

- **`opencode` not on PATH** → stop, tell the user plainly, point at the
  `pnpm add -g --allow-build=opencode-ai opencode-ai` install command.
  Don't attempt to install it silently.
- **Server fails to start** (no "listening on" line in the log within a
  few seconds) → stop, show the log content, don't retry silently.
- **`opencode run` errors or times out** → report as `BLOCKED`, same
  disposition a stuck Claude implementer would get — surfaces to the
  user via the normal `subagent-driven-development` blocked-handling
  path. Never retried automatically.
- **Fix round hits the round cap (3) with open findings, or a fix
  attempt reports `BLOCKED`** → stop, report the open findings plainly.
  **Do not** dispatch a fresh implementer on a more capable model the way
  a normal fix loop's rounds 4-5 would — that escalation is deliberately
  not automated here. The user decides: keep trying offloaded, hand the
  task to a Claude implementer, or park it.
- **`opencode-server.json` names a PID that's no longer running** (e.g.
  the machine restarted, or the process was killed outside this skill)
  → treat as stale, start a fresh server per Step 2, overwrite the
  tracking file.
- **A captured `sessionID` no longer resolves on the server** (e.g. the
  server itself was restarted between the original attempt and a fix
  round) → report this plainly rather than silently starting a fresh,
  context-less session under the same session ID assumption — the fix
  round would silently lose all prior context otherwise.

## Quick Reference

| Step | Action |
|---|---|
| 0 | Determine intent — stop request, or a dispatch (fresh/fix round) |
| 1 | Ensure `opencode.json` exists in the task worktree, gitignored |
| 2 | Locate or start `opencode serve`, tracking PID+port in the SDD workspace |
| 3 | Build the prompt — brief + report contract (fresh), or findings + report contract (fix round) |
| 4 | Dispatch via `opencode run --attach ... --format json`, with `--session <id>` on fix rounds |
| 5 | Extract `sessionID` and the final status-contract text from the JSON event stream |
| 6 | Hand back to the normal `subagent-driven-development` flow — review, fix loop, completion, unmodified |
| — | Stop: `taskkill` the tracked PID, delete the tracking file |
