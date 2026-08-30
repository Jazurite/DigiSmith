---
name: offload-implementer
description: Use when explicitly asked to offload a specific subagent-driven-development task to a third-party model instead of a normal Claude implementer — runs the task via a pluggable runner (OpenCode or Claude Code) backed by a configured gateway provider (Chutes or TokenReply).
---

# Offload Implementer

## Overview

DigiSmith's map item **K.2**, extended by **K.6** to make the runner
pluggable. Runs one `subagent-driven-development` task on a
third-party-hosted model via a resolved **runner** —
[OpenCode](https://opencode.ai) or [Claude Code](https://claude.com/product/claude-code)
itself, chosen per-profile — instead of a normal Claude implementer
subagent, when explicitly asked to offload that task. The `Agent` tool
has no non-Anthropic model routing, so this isn't a subagent dispatch —
the controller itself drives the resolved runner's CLI directly.
Explicit per-task only: nothing here runs automatically.

## When to Use

Right when the user asks to offload a specific task while running
`superpowers:subagent-driven-development` — for the task's first attempt,
or (a second, distinct trigger) for a fix round on a task this skill
already dispatched. This skill does **not** stop the server — the
OpenCode server is shared machine-wide by `digismith:depot` now, not
owned per-plan. When the user says offloaded work is done, invoke
`digismith:depot`'s `stop-opencode-server` operation directly instead.

## Prerequisites

Resolve `task_offload_runner` (default `opencode`) from the active
profile before checking prerequisites — they differ by runner:

**`opencode` runner:** `opencode` on PATH (`pnpm add -g
--allow-build=opencode-ai opencode-ai` if missing — plain `pnpm add -g
opencode-ai` alone installs a broken binary, since pnpm skips
postinstall scripts by default). Whichever credential env var the
resolved provider needs (`CHUTES_API_KEY` for Chutes,
`TOKENREPLY_API_KEY` for TokenReply — see `scripts/providers/`) must
already be set in the environment `opencode` runs in. Depot's shared
server currently exports only `CHUTES_API_KEY` at launch, so dispatching
with `task_offload_provider: tokenreply` requires the server to have
been started with `TOKENREPLY_API_KEY` set in its environment too —
restart it via `digismith:depot` if it's already running without it.

**`claude-code` runner:** `claude` on PATH, supporting `--bare` (`npm
install -g @anthropic-ai/claude-code` if missing — never auto-install,
see Error Handling). Whichever credential env var the resolved provider
needs must be set in the environment `claude` runs in — Claude Code
reads it directly at spawn time via `ANTHROPIC_BASE_URL`/
`ANTHROPIC_AUTH_TOKEN`, no shared server to pre-configure. Only
providers whose `supportsRunner` includes `"claude-code"` may be
resolved this way (today, TokenReply only — see `scripts/providers/`).

**`--auto` (opencode) / `--permission-mode auto` (claude-code) grant
real, unattended authority.** Every dispatch below runs its resolved
runner with unattended permission — OpenCode's own docs describe
`--auto` as "auto-approve permissions that are not explicitly denied
(dangerous!)", and Claude Code's `--permission-mode auto` is the
equivalent grant. In practice that means unattended file and shell
access within the target worktree for the life of the dispatch. Only
use this skill against a disposable/isolated worktree — never a
checkout holding anything sensitive.

## Process

### Step 0: Determine Intent

**"Stop offloaded work"** (or equivalent) → this skill no longer stops
anything itself. The OpenCode server is shared machine-wide by
`digismith:depot` now, not owned per-plan — tell the user to invoke
`digismith:depot`'s `stop-opencode-server` operation directly if they
want it stopped, since another plan may still be relying on it.
**Otherwise** → this is a dispatch (fresh task or fix round); continue to
Step 1.

### Step 1: Resolve Runner + Provider Config

Resolve `task_offload_runner` (default `opencode`) and
`task_offload_provider` (default `chutes`) from the active profile
(`profiles/<name>.yml`, same file `digismith:inject-standards` already
reads `standards:` from — see K.3's design doc for the provider default).

`print-config.ts` and `parse-result.ts` live in DigiSmith's own repo, not
the task worktree this dispatch targets — Step 4 dispatches into
arbitrary consumer-repo worktrees (`--dir`/`cwd` set to the task
worktree), so invoking either script by a bare relative path only works
when the controller's cwd already happens to be DigiSmith's repo, and
fails with `MODULE_NOT_FOUND` everywhere else. Locate DigiSmith's own
repo the same way `digismith:inject-standards` does under "Locating the
Standards Library":
1. Is the current working directory itself the DigiSmith repo (has
   `.claude-plugin/plugin.json` with `"name": "digismith"`)? Use it
   directly.
2. Otherwise, ask the user for DigiSmith's repo path this session and
   remember it for the rest of the conversation.

Then run, using that resolved path (absolute, or the cwd-relative path if
step 1 above applied) — never a bare relative path assumed to work from
any cwd:

```bash
node <digismith-repo>/scripts/providers/print-config.ts <resolved-provider> --role task --runner <resolved-runner>
```

**Non-zero exit** → either an unrecognized provider/runner name, or the
resolved provider's `supportsRunner` doesn't include the resolved
runner. Stop here and report `BLOCKED` — the same disposition as a
missing runner binary (see Error Handling). Never write a config that
can't authenticate.

**`opencode` runner, exit 0:** stdout is a single-key JSON object keyed
by the provider name (e.g. `{"chutes": {...}}`). Write `opencode.json`
in the worktree root as:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": <that object, verbatim>
}
```

(Skip the write if `opencode.json` is already present in the worktree
root.) Then check whether `opencode.json` is already ignored one way or
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
references your API key only via
`{env:<credential-env-var-for-the-resolved-provider>}`, never a literal
value, but it's still local machine config that shouldn't be committed.

Record the resolved provider name and the model ID `print-config.ts`
chose (the single key inside `.models` in its output) — Step 4 needs
both to build its `opencode run --model` argument.

**`claude-code` runner, exit 0:** stdout is `{"baseUrl": "...",
"credentialEnv": "..."}`. No file is written — Step 4 exports these
directly as `ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN` environment
variables at dispatch time.

### Step 2: Ensure the Resolved Runner Is Ready

**`opencode` runner:** invoke `digismith:depot`'s
`ensure-opencode-server` operation and use the port it returns for every
dispatch below. This server is shared machine-wide across every
concurrent `subagent-driven-development` plan on this machine, not
scoped to this one — Depot owns starting it, tracking its PID and port,
and all the Windows-specific WINPID resolution that requires, entirely
on its own. This skill no longer tracks a server itself.

If Depot's operation doesn't return a usable port (any of the failure
cases in its own Error Handling table — `opencode` not on PATH, server
fails to start, WINPID unresolvable), stop here and report `BLOCKED`
rather than continuing to Step 3/4 with an undefined port.

**`claude-code` runner:** invoke `digismith:depot`'s `ensure-claude-code`
operation. There is no port, no process, no state to track — this is a
stateless PATH + `--bare`-support check, invoked fresh on every
`claude-code`-runner dispatch, not just the first.

If Depot's operation reports not-ready, stop here and report `BLOCKED`
rather than continuing to Step 3/4.

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
some took over 5 minutes today. Issue either dispatch below with an
explicit `Bash` tool `timeout` of at least 300000ms (5+ minutes), not
whatever short default the harness would otherwise use. A default
timeout cutting the call off partway through a perfectly healthy run
looks indistinguishable from a real failure otherwise — see Error
Handling for how to tell the two apart.

**`opencode` runner, fresh task:**

```bash
PROMPT=$(cat <<'PROMPT_EOF'
<prompt built in Step 3, verbatim>
PROMPT_EOF
)
opencode run --attach "http://127.0.0.1:<port>" \
  --model <resolved-provider>/<resolved-model-id> --auto --format json \
  --dir "<task-worktree>" "$PROMPT" > "<workspace>/task-<N>-opencode-events.jsonl"
```

**`opencode` runner, fix round**, same heredoc-capture-then-dispatch
pattern, plus `--session "<captured sessionID>"` — and events redirect
to a `-round<R>` suffixed file, never the original attempt's file, so
the fix round's transcript doesn't overwrite it:

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

No session flag on a fresh `opencode` task — confirmed live that this
always starts a new, isolated session on an already-running server,
never carrying context from an earlier call.

**`claude-code` runner, fresh task:** export the two env vars Step 1
resolved, set the subprocess `cwd` to the task worktree at spawn time
(there is no `--dir` flag for `claude`):

```bash
PROMPT=$(cat <<'PROMPT_EOF'
<prompt built in Step 3, verbatim>
PROMPT_EOF
)
ANTHROPIC_BASE_URL="<resolved baseUrl>" \
ANTHROPIC_AUTH_TOKEN="<resolved credential env var's value>" \
claude -p "$PROMPT" --bare --model <resolved-model-id> \
  --permission-mode auto --output-format stream-json \
  --allowedTools "Read,Edit,Bash" > "<workspace>/task-<N>-claude-code-events.jsonl"
```

(run with the shell's working directory set to `<task-worktree>` first)

**`claude-code` runner, fix round**, same pattern plus `--resume
"<captured sessionID>"` instead of starting fresh, events to a
`-round<R>` suffixed file:

```bash
PROMPT=$(cat <<'PROMPT_EOF'
<prompt built in Step 3, verbatim>
PROMPT_EOF
)
ANTHROPIC_BASE_URL="<resolved baseUrl>" \
ANTHROPIC_AUTH_TOKEN="<resolved credential env var's value>" \
claude -p "$PROMPT" --bare --model <resolved-model-id> \
  --permission-mode auto --output-format stream-json \
  --resume "<captured sessionID>" \
  --allowedTools "Read,Edit,Bash" > "<workspace>/task-<N>-claude-code-events-round<R>.jsonl"
```

**Why `--bare` doesn't break standards injection:** Step 3 already
inlines the full `inject-standards` output as literal prompt text before
either runner launches — it's not a live skill invocation. `--bare`
only skips auto-discovery of skills/CLAUDE.md/hooks, not content already
pasted into the prompt.

### Step 5: Extract the Session ID and the Status Contract

Read events from the file Step 4 actually wrote for this dispatch
(`<workspace>/task-<N>-<runner>-events.jsonl`, or the `-round<R>`
suffixed variant for a fix round), then run:

```bash
node <digismith-repo>/scripts/runners/parse-result.ts <resolved-runner> "<events-file>"
```

This prints a uniform `{status, resultText, sessionId, costUsd?}` JSON
object regardless of which runner produced the raw events — `status` is
one of `"success" | "error" | "interrupted"`, `resultText` is the
model's final reply text (or `null`), and `sessionId` is the id to
capture for fix rounds.

**Fresh task only:** record the returned `sessionId`:

```bash
echo '{"task": <N>, "sessionID": "<parsed sessionId>"}' >> "<workspace>/opencode-sessions.jsonl"
```

(File name and JSON key stay `opencode-sessions.jsonl`/`sessionID` for
backward compatibility with existing workspaces — the value is just an
opaque session id now, not opencode-specific, whichever runner produced
it.)

**Fix round:** skip this — the session ID doesn't change on a fix round
(it's the same id just passed back to the runner on the command line),
so don't re-append a duplicate line to `opencode-sessions.jsonl`.

The status contract text is `resultText` from `parse-result.ts`'s
output — this is the model's final reply, matching what Step 3 asked it
to send.

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

- **The dispatched runner genuinely errors** (a real non-zero exit,
  `parse-result.ts` reporting `status: "error"` or `"interrupted"`,
  etc.) → report as `BLOCKED`, same disposition a stuck Claude
  implementer would get — surfaces to the user via the normal
  `subagent-driven-development` blocked-handling path. Never retried
  automatically.
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
- **A captured session id no longer resolves** — `opencode` runner: e.g.
  someone ran `digismith:depot`'s `stop-opencode-server` (possibly for a
  different plan entirely, since the server is shared machine-wide) or
  the machine restarted; `claude-code` runner: the session was pruned,
  expired, or this is a different machine than the one that created it
  — → report this plainly rather than silently starting a fresh,
  context-less session under the same session-id assumption. Re-run Step
  2 to get a fresh server/port (`opencode`) or confirm readiness
  (`claude-code`), then re-dispatch as a **fresh task**, not a fix round
  — the old session's context is genuinely gone, so resuming it would
  silently lose all prior context.

## Quick Reference

| Step | Action |
|---|---|
| 0 | Determine intent — a stop request is no longer this skill's concern (tell the user to invoke `digismith:depot`'s `stop-opencode-server` directly, `opencode` runner only), otherwise this is a dispatch (fresh/fix round) |
| 1 | Resolve `task_offload_runner`/`task_offload_provider`, run `print-config.ts --runner <name>` — `opencode` runner writes `opencode.json` (ignored via `.git/info/exclude`, never the tracked `.gitignore`); `claude-code` runner gets `{baseUrl, credentialEnv}`, no file written |
| 2 | `opencode` runner: invoke `digismith:depot`'s `ensure-opencode-server`, use the returned port. `claude-code` runner: invoke `digismith:depot`'s `ensure-claude-code` (stateless, every dispatch) |
| 3 | Invoke `digismith:inject-standards` (Scenario 4), then build the prompt — brief + standards + report contract requiring implement → test → **commit** → report (fresh), or findings + standards + report contract appending to the same report file (fix round) |
| 4 | Capture the prompt into `$PROMPT` via a single-quoted heredoc, then dispatch — `opencode run --attach ... --format json "$PROMPT"` or `ANTHROPIC_BASE_URL=... ANTHROPIC_AUTH_TOKEN=... claude -p "$PROMPT" --bare --output-format stream-json` — with an explicit ≥300000ms `Bash` timeout, `--session`/`--resume <id>` on fix rounds, events to a `-round<R>`-suffixed file on fix rounds |
| 5 | Run `parse-result.ts <runner> <events-file>` for a uniform `{status, resultText, sessionId, costUsd?}`; capture `sessionId` into `opencode-sessions.jsonl` only on a fresh task, never re-appended on a fix round |
| 6 | Independently verify a `DONE`/`DONE_WITH_CONCERNS` claim before trusting it, then hand back to the normal `subagent-driven-development` flow — review, fix loop, completion, unmodified |
