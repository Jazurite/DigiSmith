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
already dispatched. This skill does **not** stop the server — the
OpenCode server is shared machine-wide by `digismith:depot` now, not
owned per-plan. When the user says offloaded work is done, invoke
`digismith:depot`'s `stop-opencode-server` operation directly instead.

## Prerequisites

`opencode` on PATH (`pnpm add -g --allow-build=opencode-ai opencode-ai`
if missing — plain `pnpm add -g opencode-ai` alone installs a broken
binary, since pnpm skips postinstall scripts by default). Whichever
credential env var the resolved provider needs (`CHUTES_API_KEY` for
Chutes, `TOKENREPLY_API_KEY` for TokenReply — see `scripts/providers/`)
must already be set in the environment `opencode` runs in.

**`--auto` grants real, unattended authority.** Every dispatch below runs
OpenCode with `--auto` — its own docs describe this as "auto-approve
permissions that are not explicitly denied (dangerous!)", and the
shipped `opencode.json` here declares no `permission` block limiting it.
In practice that means unattended file and shell access within the
target worktree for the life of the dispatch. Only use this skill
against a disposable/isolated worktree — never a checkout holding
anything sensitive.

## Process

### Step 0: Determine Intent

**"Stop offloaded work"** (or equivalent) → this skill no longer stops
anything itself. The OpenCode server is shared machine-wide by
`digismith:depot` now, not owned per-plan — tell the user to invoke
`digismith:depot`'s `stop-opencode-server` operation directly if they
want it stopped, since another plan may still be relying on it.
**Otherwise** → this is a dispatch (fresh task or fix round); continue to
Step 1.

### Step 1: Ensure `opencode.json` Exists in the Task's Worktree

Check for `opencode.json` in the worktree root. **Present** → continue.
**Missing** → write it. First resolve which provider this dispatch uses: read
`task_offload_provider` from the active profile (`profiles/<name>.yml`,
same file `digismith:inject-standards` already reads `standards:` from),
defaulting to `chutes` if the field is absent (matches every existing
profile — see K.3's design doc). Then run:

```bash
node scripts/providers/print-config.ts <resolved-provider> --role task
```

**Exit 0** → its stdout is a single-key JSON object keyed by the provider
name (e.g. `{"chutes": {...}}`). Write `opencode.json` as:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": <that object, verbatim>
}
```

**Non-zero exit** (unrecognized provider name) → stop here and report
`BLOCKED` — the same disposition as a missing `opencode` binary (see
Error Handling). Never write a config that can't authenticate.

Record the resolved provider name and the model ID `print-config.ts` chose
(the single key inside `.models` in its output) — Step 4 needs both to
build its `opencode run --model` argument.

Then check whether `opencode.json` is already ignored one way or
another (`git check-ignore -q opencode.json`, exit 0 = already ignored).
If not, ignore it via `info/exclude` — a local-only, untracked git
mechanism — **never** the worktree's own tracked `.gitignore`. Resolve
its real path first rather than assuming `<worktree>/.git/info/exclude`:
in a linked worktree (the normal case for this skill), `.git` is a
*file* containing a `gitdir:` pointer, not a directory, so that path
doesn't exist and writing to it fails outright. Use:

```bash
EXCLUDE_FILE=$(git rev-parse --git-path info/exclude)
```

This resolves correctly whether the current directory is a plain repo
or a linked worktree. Note it's the **repo-wide common git dir**, shared
across every worktree of this repo — not per-worktree isolated, despite
being reached from inside one.

This is local machine config, the same class of file as
`.digismith/profile`/`.digismith/telemetry-marker` (see `MEMORY.md`'s
"`.digismith/profile` is config, not generated docs output" convention),
guaranteed to stay out of any commit because `info/exclude` is never
part of the repo's tracked tree at all — unlike `.gitignore`, there's no
file here that could ride along in a diff. Read `$EXCLUDE_FILE`'s
current content first (or note its absence), ensure it ends in a
newline if non-empty, and append a new line `opencode.json` — an append
operation only, never a whole-file rewrite. `opencode.json` itself
references your API key only via `{env:CHUTES_API_KEY}`, never a
literal value, but it's still local machine config that shouldn't be
committed.

### Step 2: Ensure the OpenCode Server Is Running

Invoke `digismith:depot`'s `ensure-opencode-server` operation and use
the port it returns for every dispatch below. This server is shared
machine-wide across every concurrent `subagent-driven-development` plan
on this machine, not scoped to this one — Depot owns starting it,
tracking its PID and port, and all the Windows-specific WINPID
resolution that requires, entirely on its own. This skill no longer
tracks a server itself.

If Depot's operation doesn't return a usable port (any of the failure
cases in its own Error Handling table — `opencode` not on PATH, server
fails to start, WINPID unresolvable), stop here and report `BLOCKED`
rather than continuing to Step 3/4 with an undefined port.

### Step 3: Build the Task Prompt

Before building either prompt below, invoke `digismith:inject-standards`
using its Scenario 4 (Dispatching a Subagent) formatting — treat this
offloaded dispatch the same as an `Agent`-tool subagent dispatch for this
purpose, even though it isn't literally one: the profile's standards
(`profiles/<name>.yml` → `standards: [...]`) matter at least as much for
a third-party model as for a Claude one. Its output (a full-content
`## Standards` block, or nothing if zero standards exist anywhere) gets
appended to the prompt below, alongside the brief/findings and the report
contract.

**Fresh task (not a fix round):** combine the task's brief (the same
content a normal implementer would receive from `scripts/task-brief`),
the inject-standards output, and this fixed report contract, appended
verbatim:

```
Once you're done (or if you get stuck):

1. Implement the change.
2. Run the tests that cover it.
3. Commit your work with git — a real commit in this worktree, not just
   changes left sitting in the working tree. This step is required: the
   controller's review tooling (`scripts/review-package`) builds every
   review from `git log`/`git diff` over a commit range, so uncommitted
   work is invisible to it — effectively the same as not having done it.
4. Write a full report to <report-file-path>: what you implemented, what
   you tested and the results, files changed, any concerns.
5. Then reply with ONLY this short block:
   Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
   Commits: <short SHA + subject, one per line, or "none">
   Test summary: <one line>
   Concerns: <one line, or "none">

A `Commits: none` reply alongside a non-empty working tree (uncommitted
changes) is a failure to flag — never a valid DONE.
```

`<report-file-path>` is `<workspace>/task-<N>-opencode-report.md`
(mirrors the brief→report naming convention `subagent-driven-development`
already uses for Claude implementers).

**Fix round:** combine the open findings verbatim (not the brief again —
the session already has that context), the inject-standards output, and
this report contract, appended verbatim:

```
Once you're done (or if you get stuck):

1. Fix the findings above.
2. Run the tests that cover the amended code.
3. Commit your work with git — a real commit in this worktree, not just
   changes left sitting in the working tree. This step is required, same
   reason as the original dispatch: uncommitted work is invisible to
   `scripts/review-package`.
4. Append a fix-report section to <report-file-path> — the SAME report
   file the original attempt wrote, not a new file: what you fixed, what
   you tested and the results, any remaining concerns. This matches
   `subagent-driven-development`'s own convention that every fix round
   appends to the same report file the re-review dispatch reads.
5. Then reply with ONLY this short block:
   Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
   Commits: <short SHA + subject, one per line, or "none">
   Test summary: <one line>
   Concerns: <one line, or "none">

A `Commits: none` reply alongside a non-empty working tree (uncommitted
changes) is a failure to flag — never a valid DONE.
```

`<report-file-path>` is the same `<workspace>/task-<N>-opencode-report.md`
used by the original attempt — never a new round-numbered file.

### Step 4: Dispatch

Capture the Step 3 prompt into a shell variable first, via a
single-quoted heredoc — a real task brief or findings list routinely
contains backticks, `$` variable references, and embedded double quotes,
any of which would corrupt or trigger unwanted expansion if interpolated
directly into a double-quoted positional argument. A single-quoted
heredoc (`<<'PROMPT_EOF'`) is immune to expansion during capture; the
resulting `"$PROMPT"` reference is then safe to pass double-quoted,
since a quoted variable reference doesn't re-parse its content.

**Real dispatches routinely take several minutes** — confirmed live:
some took over 5 minutes today. Issue the `opencode run` call below with
an explicit `Bash` tool `timeout` of at least 300000ms (5+ minutes), not
whatever short default the harness would otherwise use. A default
timeout cutting the call off partway through a perfectly healthy run
looks indistinguishable from a real failure otherwise — see Error
Handling for how to tell the two apart.

**Fresh task:**

```bash
PROMPT=$(cat <<'PROMPT_EOF'
<prompt built in Step 3, verbatim>
PROMPT_EOF
)
opencode run --attach "http://127.0.0.1:<port>" \
  --model <resolved-provider>/<resolved-model-id> --auto --format json \
  --dir "<task-worktree>" "$PROMPT" > "<workspace>/task-<N>-opencode-events.jsonl"
```

**Fix round**, same heredoc-capture-then-dispatch pattern, plus
`--session "<captured sessionID>"` — and events redirect to a
`-round<R>` suffixed file, never the original attempt's file, so the fix
round's transcript doesn't overwrite it:

```bash
PROMPT=$(cat <<'PROMPT_EOF'
<prompt built in Step 3, verbatim>
PROMPT_EOF
)
opencode run --attach "http://127.0.0.1:<port>" \
  --model <resolved-provider>/<resolved-model-id> --auto --format json \
  --session "<captured sessionID>" \
  --dir "<task-worktree>" "$PROMPT" > "<workspace>/task-<N>-opencode-events-round<R>.jsonl"
```

No session flag on a fresh task — confirmed live that this always starts
a new, isolated session on an already-running server, never carrying
context from an earlier call.

### Step 5: Extract the Session ID and the Status Contract

Read events from the file Step 4 actually wrote for this dispatch:
`<workspace>/task-<N>-opencode-events.jsonl` for a fresh task, or
`<workspace>/task-<N>-opencode-events-round<R>.jsonl` for a fix round.
Each line is one JSON event.

**Fresh task only:** every event carries a top-level `sessionID` field —
take it from any line (they're all the same session) and record it:

```bash
echo '{"task": <N>, "sessionID": "<extracted id>"}' >> "<workspace>/opencode-sessions.jsonl"
```

**Fix round:** skip this — the session ID doesn't change on a fix round
(it's the same `--session <id>` just passed on the command line), so
don't re-append a duplicate line to `opencode-sessions.jsonl`.

The status contract text is nested inside the **last** event whose
top-level `"type"` is `"text"` — that's the model's final reply,
matching what Step 3 asked it to send. The reply text itself is **not**
a top-level field on that event: it's one level down, inside a nested
`part` object. A real `type:text` event looks like:

```json
{"type":"text","timestamp":1234567890,"sessionID":"ses_...","part":{"id":"prt_...","messageID":"msg_...","sessionID":"ses_...","type":"text","text":"the actual reply content here"}}
```

Note `"type":"text"` appears at *both* levels — the event and its
nested `part` each carry their own `type` key. Match on the outer
(event-level) `type` to find the right line; the text you actually want
is at `.part.text`, not `.text`.

### Step 6: Hand Back to the Normal Flow

Before trusting a `DONE`/`DONE_WITH_CONCERNS` reply, independently verify
it — see the "a status reply can lie" bullet in Error Handling below.
Do not skip straight to reporting the contract just because the model
said so.

Report the same short status contract a normal implementer would, using
what Step 5 extracted. From here, everything is unmodified
`subagent-driven-development`: generate the review package, dispatch the
task reviewer, run the fix loop (resuming via this skill for rounds 1-3,
surfacing per Error Handling if the cap is hit), mark the task complete.
This skill's own job for this dispatch ends here.

## Error Handling

- **`opencode run` genuinely errors** (a real non-zero exit, an error
  event in the JSON stream, etc.) → report as `BLOCKED`, same
  disposition a stuck Claude implementer would get — surfaces to the
  user via the normal `subagent-driven-development` blocked-handling
  path. Never retried automatically.
- **The `Bash` tool's own call times out** — distinct from `opencode`
  itself erroring, and not a failure by itself: real dispatches routinely
  take several minutes (see Step 4). Either raise the timeout and retry,
  or, if the harness auto-backgrounds the command past its own timeout,
  wait for that command's own completion notification rather than
  treating the timeout itself as BLOCKED.
- **A status reply can lie** — confirmed live: a fix-round dispatch once
  replied "Status: DONE ... Test summary: 4 passed, 0 failed" while the
  target file had never actually been edited and the real test suite
  still failed. Before passing a `DONE`/`DONE_WITH_CONCERNS` status
  onward in Step 6, independently confirm a real commit backing the
  claim actually exists — check `git log` in the task worktree for a
  commit matching what the report/status contract claims. A file having
  visibly changed is not sufficient on its own: a `Commits: none` reply
  alongside real but uncommitted changes is the same failure mode this
  bullet exists to catch (see Step 3's commit requirement above) — only
  a real commit satisfies this check, `git status` showing a dirty
  working tree does not. On a mismatch (status claims success but no
  matching commit exists), do not pass the false status onward —
  re-dispatch (same session, fix-round pattern) with an explicit message
  naming exactly what wasn't actually done, not a generic "try again."
- **Fix round hits the round cap (3) with open findings, or a fix
  attempt reports `BLOCKED`** → stop, report the open findings plainly.
  **Do not** dispatch a fresh implementer on a more capable model the way
  a normal fix loop's rounds 4-5 would — that escalation is deliberately
  not automated here. The user decides: keep trying offloaded, hand the
  task to a Claude implementer, or park it.
- **A captured `sessionID` no longer resolves on the server** (e.g.
  someone ran `digismith:depot`'s `stop-opencode-server` — possibly for a
  different plan entirely, since the server is now shared machine-wide —
  or the machine itself restarted) → report this plainly rather than
  silently starting a fresh, context-less session under the same session
  ID assumption. Re-run Step 2 (`digismith:depot`'s
  `ensure-opencode-server`) to get a fresh server/port, then re-dispatch
  as a **fresh task**, not a fix round — the old session's context is
  genuinely gone, so resuming it would silently lose all prior context.

## Quick Reference

| Step | Action |
|---|---|
| 0 | Determine intent — a stop request is no longer this skill's concern (tell the user to invoke `digismith:depot`'s `stop-opencode-server` directly), otherwise this is a dispatch (fresh/fix round) |
| 1 | Ensure `opencode.json` exists in the task worktree, ignored via `.git/info/exclude` (never the tracked `.gitignore`) |
| 2 | Invoke `digismith:depot`'s `ensure-opencode-server` operation, use the port it returns — Depot owns starting the shared server, tracking its PID/port, and WINPID resolution entirely |
| 3 | Invoke `digismith:inject-standards` (Scenario 4), then build the prompt — brief + standards + report contract requiring implement → test → **commit** → report (fresh), or findings + standards + report contract appending to the same report file (fix round) |
| 4 | Capture the prompt into `$PROMPT` via a single-quoted heredoc, then dispatch via `opencode run --attach ... --format json "$PROMPT"` with an explicit ≥300000ms `Bash` timeout, `--session <id>` on fix rounds, events to a `-round<R>`-suffixed file on fix rounds |
| 5 | Extract the final status-contract text (nested at `.part.text`) from the JSON event stream; capture `sessionID` (event-level) only on a fresh task, never re-appended on a fix round |
| 6 | Independently verify a `DONE`/`DONE_WITH_CONCERNS` claim before trusting it, then hand back to the normal `subagent-driven-development` flow — review, fix loop, completion, unmodified |
