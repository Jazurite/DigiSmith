# Implementer-Task Offload (K.2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `offload-implementer` — DigiSmith's map item **K.2** — a
skill that runs one `subagent-driven-development` task on a Chutes-hosted
model (Kimi K3) via a persistent OpenCode server, when explicitly asked
to offload that task, instead of a normal Claude implementer dispatch.

**Architecture:** A single new skill invoked by the controller itself
(not a fresh `Agent`-tool subagent — that tool has no non-Anthropic model
routing). It shells out to the `opencode` CLI via `Bash`: starts (or
reuses) a persistent `opencode serve` process per plan, dispatches each
offloaded task as a fresh, isolated session on that server
(`opencode run --attach ... --format json`), captures the session ID
from the JSON event stream for later fix-round resumption
(`--session <id>`), and reads the same report-file contract a Claude
implementer would produce so the rest of `subagent-driven-development`
(review dispatch, ledger bookkeeping) needs no special case. Failures
surface to the user rather than silently falling back to Claude.

**Tech Stack:** Claude Code Skills (`SKILL.md`, YAML frontmatter), the
`opencode` CLI (Node-based, installed via `pnpm add -g
--allow-build=opencode-ai opencode-ai`), Chutes' OpenAI-compatible
endpoint via a per-worktree `opencode.json`. No application code, no
test framework in the traditional sense — verification is dogfooding via
**real execution** against the actual live OpenCode+Chutes stack (not
reasoning-only): unlike map item I.1's Jira dogfood, nothing here touches
a team-visible external system, so there's no reason to hold back from
exercising the real mechanism end to end.

**Spec:** `.digismith/docs/implementer-offload/design.html`
(published: https://claude.ai/code/artifact/da8297f1-e805-4f6c-901f-f81ef15cadb4)

## Global Constraints

- **Explicit per-task trigger only.** This skill is invoked when the
  user explicitly asks to offload a specific task. No task-qualification
  logic anywhere — that's out of scope by design.
- **Controller-driven, not `Agent`-tool dispatch.** Every step below runs
  in the controller's own session via `Bash`, not as a subagent.
- **Server lifecycle:** one `opencode serve` process per plan, started on
  first use, reused by every subsequent offloaded task in that plan
  (fresh session each time — verified live that a bare `opencode run
  --attach` with no session flag never carries context from a prior
  call), stopped explicitly when offloaded work is done for the plan.
  Never started with `--mdns` or a non-`127.0.0.1` `--hostname`.
- **`--format json` is required** on every dispatch, not the default
  human-readable output — it's the only way to capture both the
  response text and the real `sessionID` field needed for fix-round
  resumption, verified live.
- **Fix rounds 1-3 resume the captured session** (`--session <id>`), same
  pattern as resuming a Claude implementer. **No automatic rounds 4-5
  escalation** — if the round cap is hit or OpenCode gets stuck, this
  surfaces to the user; never silently falls back to a Claude
  implementer.
- **Review is unchanged.** The diff goes through the exact same
  `task-reviewer` dispatch and `review-package` script as any other
  task — this plan does not modify anything under
  `subagent-driven-development`'s own review machinery.
- **Report contract matches the Claude implementer template exactly**
  (`Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT`,
  commits, one-line test summary, concerns) so nothing downstream needs
  to know the diff came from OpenCode.
- **Windows environment specifics:** no `pkill` in this Git Bash — use
  `taskkill //PID <pid> //F`. `pnpm add -g opencode-ai` alone installs a
  broken binary (pnpm skips postinstall scripts by default) — must use
  `pnpm add -g --allow-build=opencode-ai opencode-ai`.
- **Model is hardcoded to `chutes/moonshotai/Kimi-K3-TEE`** for this
  version — no multi-model selection.
- **`opencode.json` is per-worktree local config, not shipped.** It must
  exist in whatever worktree an offloaded task runs in, referencing the
  Chutes API key via `{env:CHUTES_API_KEY}` (never a literal key), and
  must be gitignored — it's dev-machine tooling config, not part of the
  skill's own shipped files.
- **Skill location:** `skills/offload-implementer/SKILL.md`, new file
  only. No hook is inserted into `subagent-driven-development`'s own
  file — same description-based self-triggering pattern every other
  DigiSmith skill uses relative to third-party Superpowers skills.
- **Roadmap update:** `MEMORY.md`'s **K** row and `.digismith/history.html`
  need to reflect K.2 shipped — see Task 2.

---

### Task 1: `offload-implementer` Skill — Write, Dogfood for Real

**Files:**
- Create: `skills/offload-implementer/SKILL.md`

**Interfaces:**
- Consumes: a task brief in the same shape `scripts/task-brief` produces
  (this skill's own dogfood constructs one directly, since it isn't
  running inside a real `subagent-driven-development` invocation).
- Produces: a committed diff in the target worktree, a report file
  matching the Claude-implementer report contract, and a captured
  `sessionID` for fix-round resumption. Nothing downstream in this plan
  consumes this skill's output — it's a terminal capability, invoked by
  a human request each time.

- [ ] **Step 1: Write `skills/offload-implementer/SKILL.md`**

```markdown
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
CHUTES_API_KEY=$(python3 ~/.claude/skills/chutes-ai/scripts/manage_credentials.py get --field api_key)
export CHUTES_API_KEY
opencode serve --port 0 --hostname 127.0.0.1 > "<workspace>/opencode-server.log" 2>&1 &
SERVER_PID=$!
sleep 2
```

Read `<workspace>/opencode-server.log` for the line `opencode server
listening on http://127.0.0.1:<port>` and extract `<port>` from it — this
is the real assigned port, not something to guess. If that line isn't
present after a few seconds, this is a startup failure (see Error
Handling). On success, write
`<workspace>/opencode-server.json` as `{"pid": <SERVER_PID>, "port":
<port>}`.

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
```

- [ ] **Step 2: Dogfood — real end-to-end dispatch against a scratch repo**

Unlike I.1's Jira dogfood, this touches nothing team-visible or external
beyond Chutes itself (already known-cheap, subscription-covered) — verify
for real, not by reasoning.

```bash
rm -rf /tmp/offload-dogfood
mkdir -p /tmp/offload-dogfood
cd /tmp/offload-dogfood && git init -q && git config user.email "dogfood@local" && git config user.name "dogfood"
```

```python
# /tmp/offload-dogfood/calc.py
def apply_discount(price, percent):
    return price - percent
```

```python
# /tmp/offload-dogfood/test_calc.py
from calc import apply_discount

def test_ten_percent_off_hundred():
    # Passes even with the bug -- 100 - 10 (flat) happens to equal
    # 100 - 10% of 100. A decoy, not real coverage; kept so the fix
    # doesn't accidentally regress this coincidentally-correct case.
    assert apply_discount(100, 10) == 90

def test_zero_percent_is_unchanged():
    # Also passes even with the bug -- 0 subtracted either way. Another
    # decoy, same reason as above.
    assert apply_discount(50, 0) == 50

def test_ten_percent_off_two_hundred():
    # The real case: buggy code returns 190 (200 - 10 flat); correct
    # behavior is 200 - 20 (10% of 200) = 180. Verified by hand before
    # writing this plan: buggy(200,10)=190, correct(200,10)=180.
    assert apply_discount(200, 10) == 180
```

```bash
cd /tmp/offload-dogfood
git add calc.py test_calc.py
git commit -q -m "initial: buggy discount calc (subtracts percent as a flat amount)"
python3 -m pytest test_calc.py -v
```

Expected: exactly 2 pass (the two decoys, coincidentally correct for
those specific numbers), 1 fails
(`test_ten_percent_off_two_hundred`, expected `180`, got `190`) — this
is the real, unambiguous bug the dogfood task needs to find. If the
actual result differs from this, stop and re-examine `calc.py` before
continuing; don't proceed with a dogfood whose starting state doesn't
match what this plan claims.

Follow `skills/offload-implementer/SKILL.md` yourself, for real, against
this scratch repo as the "task worktree": Step 1 (write `opencode.json`
there, confirm `.gitignore` gets it), Step 2 (start a fresh server — none
should exist yet for this ad hoc dogfood, no real SDD workspace exists
either, so use `/tmp/offload-dogfood/.dogfood-workspace/` in its place
for `opencode-server.json` and the rest), Step 3 (build a prompt: "Run
`python3 -m pytest test_calc.py -v`, fix the bug in `calc.py` so all
tests pass, don't weaken the tests" + the report contract, report path
inside `.dogfood-workspace/`), Step 4 (dispatch for real), Step 5
(extract the session ID and status contract from the real JSONL output —
show the actual extracted values, not a description of what they'd look
like), Step 6 (report the status contract).

Expected: a real fix is applied to `calc.py` (something like `price -
(price * percent / 100)`), `python3 -m pytest test_calc.py -v` genuinely
shows 3/3 passing afterward (re-run it yourself, independently — don't
trust the report alone), the report file exists with real content, and
`.dogfood-workspace/opencode-sessions.jsonl` has one line with a real
`sessionID` value.

- [ ] **Step 3: Dogfood — fix-round resumption against the same session**

Still using the server from Step 2 (don't stop it yet) and the
`sessionID` captured there. Manually reintroduce a small issue to
exercise a real fix round: edit `calc.py` back toward a subtly wrong
form (e.g. reintroduce integer-division truncation:
`price - (price * percent // 100)` — wrong only for non-round results,
e.g. `apply_discount(99, 33) `) and commit it as if it were the
"reviewed" state.

Follow Step 3 (fix-round prompt: a findings message describing the
integer-division issue, not the original brief) and Step 4 (dispatch
with `--session "<the real captured id>"`) yourself, for real. Expected:
the reply shows awareness of the earlier conversation (e.g. references
fixing this same function again, doesn't ask what `apply_discount` is
from scratch) — this is the actual test of whether session resumption
carries real context, not just whether the API call succeeds. Confirm
the new fix is correct (re-run pytest with a test case that would catch
integer-division truncation, e.g. `apply_discount(99, 33) == 66.33`,
independently).

- [ ] **Step 4: Dogfood — stop the server, confirm cleanup**

Follow the Stop the Server section of the skill yourself, for real,
against the server started in Step 2. Confirm via
`tasklist //FI "PID eq <pid>"` (Windows) that the process is genuinely
gone afterward, and that `.dogfood-workspace/opencode-server.json` no
longer exists.

```bash
rm -rf /tmp/offload-dogfood
```

- [ ] **Step 5: If any dogfood step in Steps 2-4 surfaced a real gap, fix it now**

If every step matched its expected outcome, skip this step. Otherwise
fix `skills/offload-implementer/SKILL.md`'s wording directly, then
re-run the specific dogfood step that failed to confirm the fix.

- [ ] **Step 6: Commit**

```bash
cd D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\implementer-offload
git add skills/offload-implementer/SKILL.md
git commit -m "feat(offload-implementer): add K.2 skill — persistent OpenCode server, per-task offload to Kimi K3"
```

---

### Task 2: Update `.digismith/history.html` and `MEMORY.md` for K.2

**Files:**
- Modify: `.digismith/history.html`
- Modify: `MEMORY.md`

**Interfaces:**
- Consumes: nothing structural — documentation update reflecting Task
  1's completed work.
- Produces: an up-to-date living tracker.

- [ ] **Step 1: Update the `K` row in `.digismith/history.html`'s map table**

Read the current `K` row first (its exact text depends on whether K.1's
own shipping was ever caught up in this file — check before writing a
`Replace:` block, since earlier session notes found this file
inconsistently updated for K.1). Add K.2 to whatever the row's
description cell currently contains, in the same `**K.2** ... <span
class="status done">Done</span>` shape the file's other multi-sub-item
rows use (e.g. the **I** row), and set the row's own status cell to
`<span class="status next">In progress</span>` if `K.1`/`K.2+` aren't
both fully done, or `Done` if they are — read the row first, don't
assume.

- [ ] **Step 2: Add a K.2 paragraph after the existing per-feature list**

Find the last `<p style="font-size:.88rem; color:var(--muted);">` entry
in the per-feature list (after whichever map item shipped most recently
per that list's own ordering) and add, in the same style:

```html
  <p style="font-size:.88rem; color:var(--muted);">
    <strong>K.2 — Implementer-task offload:</strong> <code>offload-implementer</code> skill —
    <a href="docs/implementer-offload/design.html">design spec</a> ·
    <a href="docs/implementer-offload/plan.md">implementation plan</a>
  </p>
```

- [ ] **Step 3: Add a timeline entry**

Append to the `.timeline` div, after its existing final entry (read the
file first to find it — don't assume which entry is last without
checking, since other sessions have added entries since this plan was
written):

```html
    <div class="event">
      <div class="date">2026-08-27</div>
      <h4>K.2 spiked, brainstormed, specced, and built — 2 tasks, subagent-driven-development</h4>
      <p>Jack asked to try offloading a real implementer task to a
      Chutes-hosted model. A raw completion call (K.1's own mechanism)
      turned out to have no tool access at all — a structural gap, not a
      quality one. A feasibility spike proved the real fix: OpenCode (not
      Aider, which needs Python &lt;3.13 and this machine only has 3.14.5),
      driven by Kimi K3 via Chutes, autonomously read a file, ran a test
      suite, diagnosed and fixed a real seeded bug, and verified it,
      unassisted. The architectural brainstorm that followed added a
      persistent-server-plus-fresh-session-per-task design (verified live
      that sessions genuinely isolate on a shared server), explicit
      per-task opt-in (nothing automatic), and surfaced failures instead
      of silent fallback to Claude given the higher stakes than K.1's
      document rewrap. Task 1 built and dogfooded
      <code>skills/offload-implementer/SKILL.md</code> for real against a
      scratch repo, including a real fix-round session-resumption test.
      Task 2 is this history.html and MEMORY.md update.</p>
    </div>
```

- [ ] **Step 4: Update `MEMORY.md`'s `K` row**

Read the row's current exact text first (it may have been touched by
other work since this plan was written — the K.1 sub-bullet's own
wording is a reasonable anchor to find it by). Add a **K.2** sub-item
in the same style as the row's existing **K.1**/**K.2+** structure:

```markdown
**K.2** offload a single `subagent-driven-development` task, explicitly requested per-task, to a Chutes-hosted model (Kimi K3) via a persistent OpenCode server — `digismith:offload-implementer` skill, shipped 2026-08-27. Fresh isolated session per task on a shared server process; failures surface rather than silently falling back to Claude. See the design spec's Out of Scope section for what this deliberately doesn't do (automatic task qualification, multi-model selection, real multi-file plan-scale testing)
```

placed after whatever the row's current **K.1**-related text ends with,
before the closing `|`.

- [ ] **Step 5: Commit**

```bash
cd D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\implementer-offload
git add .digismith/history.html MEMORY.md
git commit -m "docs: update history — offload-implementer (K.2) shipped"
```

---

**After Task 2's final review passes:** per `MEMORY.md`'s Conventions
("Every `subagent-driven-development` plan invokes
`digismith:report-implementation`"), invoke `digismith:report-implementation`
before this plan's ledger is deleted.

**After this plan merges:** the real acceptance bar beyond Task 1's
dogfood is offloading an actual task inside a real, separate
`subagent-driven-development` plan — something with real ambiguity or
multi-file scope, not this plan's own deliberately small, pre-verified
bug. That run is the first genuine test of whether K.2 is *useful*, not
just whether the mechanism works — this plan only proves the latter.
