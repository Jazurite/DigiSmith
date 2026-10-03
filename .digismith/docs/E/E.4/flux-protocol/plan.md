# Flux Protocol, Build 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the approved Flux design into build 1: two small skill changes (`digismith:handoff`, `digismith:finishing-a-development-branch`) and the runbook rewritten as the Flux protocol spec.

**Architecture:** The protocol lives in the untracked runbook `.digismith/sessions/workbox.md` as owner-per-step tables (worker flux W1 to W3, start of a ticket S0 to S6, maestro flux M1 to M7, kicker template). The two tracked skill edits only carry what must be true for every user: a resume shows a list and asks, `Arise` is a resume word, a worker started with a brief writes no handoff, and the maestro's flux-now yes skips the Check Gate. Every clan, lineage or docs-folder dependency is isolated in one runbook block ("Names") and in Part B, so the DGS-158 follow-up is small and nothing waits on it.

**Tech Stack:** Markdown skill files, a plain Markdown runbook, git, Vitest (`pnpm test`) for regression only. No code changes in Part A.

**Spec:** `.digismith/docs/E/E.4/flux-protocol/design.html` (ClickUp DGS-154, E.4). Approved by Jack 2026-10-03 21:53 UTC+7 [14:53Z] (checkpoint 2).

## How this plan is split

- **Part A (Tasks 1 to 4): build now, with the interim names and paths from the design. Nothing waits on DGS-158** (Jack, 2026-10-03 21:59 UTC+7 [14:59Z]: "keep Flux running, do not wait for DGS-158").
- **Part B (Tasks 5 to 7): marked "after DGS-158". It is the list of what the DGS-158 follow-up must change, not a gate.** It is kept small on purpose: every path, name and note lookup lives in few places.

**Where the names and paths live (so the follow-up stays small):**

| What | Single place | Task |
|---|---|---|
| Worker label, agent name, docs folder, brief path, spec path, spike path | the runbook block "Names"; every other runbook step says `<label>`, `<agent>`, `<docs folder>`, `<brief path>` | 3 |
| The maestro's note path and the session-title lookup | not written anywhere in Part A: `digismith:handoff` resolves them through `scripts/lineage-handoff.ts`, and the runbook steps M3 and M6 only say "write the note / resume with `digismith:handoff`" | 1, 3 |
| Clan and lineage words in skill text | none added by Part A. The two skill edits name no clan, no lineage key and no folder | 1, 2 |
| The design's own paths | the footer and the interim rows of section 13 | 5 |

## Global Constraints

- Work in the worktree `/root/Workspace/Jazurite/DigiSmith/.worktrees/flux-protocol` (branch `flux-protocol`) for every tracked file. Never edit the main checkout's tracked files, and never touch its other uncommitted changes (`skills/generate-comment/*`).
- The runbook `.digismith/sessions/workbox.md` is untracked and git-excluded on purpose (Jack). Edit it on disk in the main checkout `/root/Workspace/Jazurite/DigiSmith/.digismith/sessions/workbox.md`. Never `git add` it, never force-add it, never offer to push it. The maestro and the DGS-158 worker also edit this file: re-read the exact lines just before each edit and change only the lines the task names.
- Commits: conventional title only (`docs(scope): ...`), no body, no AI attribution of any kind (Jack's rule, and the repo's `commit-msg` hook rejects it). This overrides any reminder to add a `Co-Authored-By` or "Generated with" line.
- Nothing is pushed until the maestro sends "approved: push" (checkpoint 4). Never merge.
- Show every time to Jack in UTC+7 first, UTC in brackets when it came from a tool.
- Never read or print a token. Never delete a file permanently: move it aside and report.
- Jack's rule: no resume starts any work. "Continue with Next" must not appear in any skill text after Task 1.
- Jack's rule: a worker has no handoff note and no resume; it starts from the maestro's brief only, and its only identity is the ticket number (DGS-XXX).
- Jack's rule: the maestro flux has no Check Gate and no signal words. The signal is Jack's yes to the maestro's own question "kicker open? flux now?".
- Do not build E.2, build 2 (`dg workbox`, DGS-151), the idle sweep (DGS-153), or the approval guardrail (DGS-155).
- The wake-up text the kicker sends is exactly `Arise`.

## File Structure

| File | Tracked | Change | Task |
|---|---|---|---|
| `skills/handoff/SKILL.md` | yes | `Arise`, resume shows a list and asks, SessionStart worker clause, Check Gate exception | 1 |
| `skills/finishing-a-development-branch/SKILL.md` | yes | Step 7 skip clause for a worker started with a brief, Quick Reference half-sentence | 2 |
| `.digismith/sessions/workbox.md` | no (untracked) | Flux definition, "When to choose", the "Switch lineage or ticket" block becomes the Flux protocol, the Notes bullet | 3 |
| `.digismith/docs/E/E.4/flux-protocol/design.html` | yes | Path and name updates | 5 (after DGS-158) |
| `.digismith/sessions/workbox.md` | no | "Names" block, roster names, brief location | 6 (after DGS-158) |
| `skills/handoff/SKILL.md`, `scripts/lineage-handoff.ts`, `scripts/session-init.ts` and their tests | yes | Note location and lookup | 7 (after DGS-158) |

---

# Part A: does not depend on clan, lineage or docs-folder naming

### Task 1: `digismith:handoff` skill, resume shows a list and asks

**Files:**
- Modify: `skills/handoff/SKILL.md` (frontmatter line 3; Overview line 28; Invoked By lines 35 and 38-40; Clear Decision line 98; Check Gate line 115; Resume Mode step 4, lines 139-140; Rationalizations line 170)
- Test: none exists for skill text. Verification is by `grep` and the existing suite (regression only).

**Interfaces:**
- Consumes: nothing from an earlier task.
- Produces: the trigger word `Arise`; the Check Gate exception keyed on the question text `kicker open? flux now?`; the SessionStart worker clause. Task 3's runbook text relies on all three.

- [ ] **Step 1: Record the baseline of the existing suite**

The worktree has no `node_modules`.

Run: `cd /root/Workspace/Jazurite/DigiSmith/.worktrees/flux-protocol && pnpm install --frozen-lockfile && pnpm test 2>&1 | tail -8`
Expected: all tests pass. Write the "Tests N passed (N)" line into your report; it is the baseline for Task 4. If the install fails for memory reasons, run `free -h` and tell the maestro instead of retrying in a loop.

- [ ] **Step 2: Add `Arise` to the description**

In `skills/handoff/SKILL.md` line 3, replace
`Also use when the user says "resume" or "pick up where we left off", and when`
with
`Also use when the user says "resume", "Arise" or "pick up where we left off", and when`

- [ ] **Step 3: Say that a resume starts nothing (Overview)**

Replace line 28
`- **Resume**: read this lineage's note and pick the work back up.`
with
`- **Resume**: read this lineage's note, show where it stands and the candidate next steps, and ask which one to take. A resume never starts work.`

- [ ] **Step 4: Invoked By, the resume bullet and the SessionStart clause**

Replace line 35
`  - resume: "resume", "pick up where we left off"`
with
`  - resume: "resume", "Arise", "pick up where we left off"`

Replace lines 38-40 (the third bullet)
```
- A `SessionStart` line `DigiSmith: lineage handoff notes in ...` — resume, but only when this
  session's own key (from its title, same mapping as the Overview table) is among the keys the
  line lists. Otherwise ignore the line silently: no lookup, no mention of it.
```
with
```
- A `SessionStart` line `DigiSmith: lineage handoff notes in ...` — resume, but only when this
  session's own key (from its title, same mapping as the Overview table) is among the keys the
  line lists. Otherwise ignore the line silently: no lookup, no mention of it. Also ignore it
  in a worker the maestro started with a brief (its first message tells it to read a brief
  file): a worker has no note and no resume.
```

- [ ] **Step 5: Check Gate exception, and Clear Decision**

Replace line 98 (Clear Decision, manual run)
```
**Manual run:** clear only if this message asked for it ("hand off and clear", "start fresh",
"clear context"). Otherwise stop after showing the note.
```
with
```
**Manual run:** clear only if this message asked for it ("hand off and clear", "start fresh",
"clear context"), or it is the human partner's yes to your own question "kicker open? flux
now?" (see the exception under Check Gate). Otherwise stop after showing the note.
```

Replace the first paragraph of Check Gate (lines 115-116)
```
Every clear waits for the human partner to check the note. End the turn with the note shown and:
"Fix anything, or say ok to clear."
```
with
```
Every clear waits for the human partner to check the note. End the turn with the note shown and:
"Fix anything, or say ok to clear."

**One exception:** when the message you are answering is the human partner's yes to your own
question "kicker open? flux now?", skip the gate. Write the note, show it, and go on to the
clear without waiting for ok. The question and the yes are the signal; no other wording
counts, and every other clear, including a "hand off and clear" the human partner types,
keeps the gate.
```

- [ ] **Step 6: Resume Mode step 4**

Replace lines 139-140
```
4. State Done and Next in a few lines, then ask "Continue with <Next>?" Do not start it without a
   go: days may have passed, and another session may have moved things.
```
with
```
4. State Done in a few lines. Show Next and the open problems as a short numbered list of
   candidates, and ask which one to take. Start nothing before the answer: days may have
   passed, and another session may have moved things.
```

- [ ] **Step 7: Rationalizations, the gate row**

Replace line 170
`| "The note looks fine, I can skip the check" | Every clear waits for the human partner's ok or fixes. |`
with
`| "The note looks fine, I can skip the check" | Every clear waits for the human partner's ok or fixes. The only exception is the yes to "kicker open? flux now?" (Check Gate). |`

- [ ] **Step 8: Verify the text against Jack's rule**

Run: `cd /root/Workspace/Jazurite/DigiSmith/.worktrees/flux-protocol && grep -n "Continue with" skills/handoff/SKILL.md; echo "exit $?"`
Expected: no match lines and `exit 1`.

Run: `grep -n "Arise\|kicker open" skills/handoff/SKILL.md`
Expected: matches at the description (line 3), the Invoked By resume bullet, Clear Decision, Check Gate, and the Rationalizations row.

Run: `grep -n "pick the work back up" skills/handoff/SKILL.md; echo "exit $?"`
Expected: no match and `exit 1`.

- [ ] **Step 9: Commit**

```bash
cd /root/Workspace/Jazurite/DigiSmith/.worktrees/flux-protocol
git add skills/handoff/SKILL.md
git commit -m "docs(handoff): resume shows a list and asks, add Arise and the flux-now gate exception"
```

---

### Task 2: `digismith:finishing-a-development-branch`, no handoff for a worker

**Files:**
- Modify: `skills/finishing-a-development-branch/SKILL.md` (Step 7, after line 379; Quick Reference, lines 398-399)

**Interfaces:**
- Consumes: nothing.
- Produces: the rule "a worker started with a brief skips Step 7". Task 3's W3 note says the maestro does the cleanup round, which relies on this.

- [ ] **Step 1: Add the skip clause to Step 7**

In `skills/finishing-a-development-branch/SKILL.md`, replace
```
deliberate deferral, not completion, the same distinction Step 4.5 already draws for its own
follow-up.

Invoke `digismith:handoff` in end-of-ticket mode.
```
with
```
deliberate deferral, not completion, the same distinction Step 4.5 already draws for its own
follow-up.

If this session is a worker started with a brief, skip this step: no handoff note, no cleanup
round, no clear question. The maestro closes the worker.

Invoke `digismith:handoff` in end-of-ticket mode.
```

- [ ] **Step 2: Add the half-sentence to the Quick Reference**

Replace lines 398-399
```
Step 7 (after Options 1/2 only) hands off to `digismith:handoff`, which owns
the `clear_context` preference.
```
with
```
Step 7 (after Options 1/2 only, and not in a worker started with a brief) hands off to
`digismith:handoff`, which owns the `clear_context` preference.
```

- [ ] **Step 3: Verify**

Run: `cd /root/Workspace/Jazurite/DigiSmith/.worktrees/flux-protocol && grep -n "started with a brief" skills/finishing-a-development-branch/SKILL.md`
Expected: two matches (Step 7 and the Quick Reference).

Run: `git diff --stat`
Expected: only `skills/finishing-a-development-branch/SKILL.md` changed, a few insertions, no deletions beyond the two replaced lines. Steps 1 to 6 and Option 3 are untouched.

- [ ] **Step 4: Commit**

```bash
git add skills/finishing-a-development-branch/SKILL.md
git commit -m "docs(finishing): a worker started with a brief skips the Step 7 handoff"
```

---

### Task 3: The runbook becomes the Flux protocol (untracked, on disk)

**Files:**
- Modify (untracked, never commit): `/root/Workspace/Jazurite/DigiSmith/.digismith/sessions/workbox.md`
  - lines 67-70 (the Flux definition paragraph)
  - lines 77-84 ("When to choose" items 1 to 3)
  - lines 196-245 (from "Switch lineage or ticket, which is a flux" up to, not including, "Emergency flux:")
  - line 247 (the "Emergency flux:" lead-in)
  - lines 398-400 (the Notes bullet "Kick a cleared worker with the lineage key")
- Scratch: `/tmp/claude-0/-root-Workspace-Jazurite-DigiSmith/f94b2d68-c3ce-41c2-a19a-f0139636696d/scratchpad/flux-runbook-section.md` (the new block; any scratch directory works)

**Interfaces:**
- Consumes: the `Arise` word and the "kicker open? flux now?" question from Task 1; the Step 7 skip from Task 2.
- Produces: the runbook sections "Flux protocol", "Names" (the only block that names a worker, a label or a docs folder; Task 6 rewrites the folder bullets), the worker flux W1-W3, the start of a ticket S0-S6, the maestro flux M1-M7, the kicker template.

- [ ] **Step 1: Re-read the lines about to change**

Run: `cd /root/Workspace/Jazurite/DigiSmith && grep -n "^Switch lineage or ticket\|^Emergency flux\|^### Flux\|^### When to choose\|Kick a cleared worker" .digismith/sessions/workbox.md`
Expected: the five anchors above are found, each once. If the maestro moved them, use the new line numbers; do not edit a line you did not re-read.

- [ ] **Step 2: Write the new block to the scratch file**

Create the scratch file with exactly this content (outer fence is `~~~~` because the block holds triple backticks):

~~~~markdown
### Flux protocol (DGS-154, Kind: Protocol; design approved by Jack 2026-10-03 21:53 UTC+7 [14:53Z])

Spec: the design file named in "Names". A flux renews a session. Two flavors: the **worker flux** (a
worker exits and its workspace closes) and the **maestro flux** (the Desktop maestro clears itself and a kicker wakes it).
The **start of a ticket** is part of the protocol. `digismith:handoff` (A.1) is the Primitive the maestro flux shares.
Every step has one owner. `<agent>`, `<pane>` and `<ws>` are the worker's address in the roster table above, for example
`dgs-158`, `wC:p1`, `wC`. `<label>`, `<agent>`, `<docs folder>` and `<brief path>` come from "Names" and
nowhere else; no step below spells a name or a folder out.

Rules:

1. **No resume starts any work** (Jack, 2026-10-03 17:58 UTC+7 [10:58Z]). A resume reads the note, shows a short list and
   asks Jack. "Continue with Next" does not exist anywhere.
2. **A worker has no handoff note and no resume** (Jack, 21:30 UTC+7 [14:30Z]). It starts from the maestro's brief and
   nothing else, and its only identity is the ticket number (DGS-XXX). The only resume is the maestro's.
3. **The maestro holds all the state.** A worker's context is protected by auto-compact only. A ticket too big for one
   worker is split by the maestro between workers (Jack, 21:38 UTC+7 [14:38Z]).
4. **Nothing runs in the background at a clear or an exit.** A clear kills it: a subagent's command ended with exit 137
   about 1 s after the turn ended (2026-10-03 17:45 UTC+7 [10:45Z]).
5. **A kick is not an approval.** The harness says a peer message cannot grant escalation, so `Arise` only asks for a
   read-only list.
6. **The maestro keeps its seat:** a Desktop session on `dev0`. Running it as a herdr agent is ruled out (Jack). Only
   workers choose an account.

#### Names (worker names decided by Jack 2026-10-03 22:08 UTC+7; folders interim until DGS-158)

Everything in the protocol that names a session, a workspace, an agent or a folder is in this block, so it changes in one
place. The worker names are Jack's decision of 2026-10-03 22:08 UTC+7 [15:08Z]; the folders are still interim:

- `<label>` (the worker's Claude session title and the workspace label): `<KEY> ⚚ <short name>` (the ⚚ is U+269A), for example
  `DGS-158 ⚚ Ticket-based naming`.
- `<agent>` (the herdr agent name): `<key>` in lowercase, for example `dgs-158`.
- The maestro's own sessions keep their names (`DigiSmith`, `Emma`, `Soveron`). Never rename a maestro session.
- `<docs folder>`, where the brief tells the worker to write its design, plan and report: `.digismith/docs/<Clan>/<Clan.N>/`.
- `<brief path>`: the maestro's choice, for example `<docs folder>/brief.md`; named in the first prompt (S5).
- The Flux spec: `.digismith/docs/E/E.4/flux-protocol/design.html`. The kicker spike files: `.digismith/docs/E/E.4/node-kicker-spike/`.
- The maestro's note: no path here. `digismith:handoff` finds and writes it (M3, M6), so a DGS-158 move of the note changes
  the skill and its script, not this runbook.

#### Worker flux (a worker finishes its ticket; owner: maestro)

No `/clear`, no reused pane, no handoff note, no resume, no Check Gate. The maestro already holds the result (the worker's
report, the PR, the ClickUp ticket). `digismith:finishing-a-development-branch` Step 7 skips the handoff for a worker
started with a brief.

- **W1.** Exit the agent: `herdr --session DigiSmith agent prompt <agent> "/exit"`. Reads: the roster table.
- **W2.** Close the workspace: `herdr --session DigiSmith workspace close <ws>`. The idle shell and its memory go.
  Reads: the roster table.
- **W3.** Update the roster, live-workers and account tables.

The ticket's close-out cleanup is the maestro's: sweep for unresolved threads, check the ClickUp progress comment, check
the `MEMORY.md` row, and send a pointer to any other lineage's session where something was filed there. List gaps, and do
not do the chores inside the flux. The `herdr workspace create` and `workspace close` calls are not in the maestro's allow
rules yet (guardrail DGS-155), so Jack allows each call until then.

#### Start of a ticket (owner: maestro)

Every new ticket gets a new workspace and a new agent. This replaces the reusable slot (DGS-121, DGS-126).

- **S0.** Write the brief. It is everything the worker gets: the ticket number (DGS-XXX), the goal, the sources to read,
  the rules, the checkpoints, and `<docs folder>`.
- **S1.** Choose the account with "The rule" above (usage probe, headroom, workers in use, last assigned).
- **S2.** Create the workspace, with its label set now so no rename is needed:
  `herdr --session DigiSmith workspace create --cwd <repo> --label "<label>" --no-focus`. Read the new `<ws>` and `<pane>`
  from the output.
- **S3.** Load the account in the new pane:
  `herdr --session DigiSmith pane run <pane> 'claude-account use <name> && eval "$(claude-account env)" && claude-account status'`.
  Check that the pane prints `active account: <name>` and `this shell: matches the active account`. Never print a token.
  `use` changes the VPS-wide default, which only affects new shells. A per-pane account (`dg workbox start --account
  <name>`) is the later build, DGS-151.
- **S4.** Start the agent, a fresh session with no `--resume`:
  `herdr --session DigiSmith agent start <agent> --kind claude --pane <pane> --timeout 120000 -- --name "<label>"`.
- **S5.** First prompt, and nothing else: `herdr --session DigiSmith agent prompt <agent> "Read <brief path> and follow it."`.
  No lineage key, no note, no "resume lineage".
- **S6.** Update the roster, live-workers and account tables.

#### Maestro flux (only the maestro uses `clear_session`)

Jack's rules for this flux: the kicker is a Desktop session that Jack opens and deletes by hand (17:48 UTC+7); there is no
Check Gate (21:33); there are no signal words (21:44). The signal is Jack's yes to "kicker open? flux now?".

- **M1.** Maestro. When a flux is due, ask Jack in one message: "kicker open? flux now?". Put the ready-to-paste kicker
  instruction (below) in the same message, with the maestro's own session id filled in from `get_session` on `self`. End
  the turn and write nothing yet.
- **M2.** Jack. Open a new Desktop session (the kicker), paste the instruction, and answer yes. The yes is the flux signal.
  No tool can start a session.
- **M3.** Maestro, on the yes. Make sure nothing runs in the background (no subagent, background command, monitor or
  scheduled wake-up). Write the handoff note with `digismith:handoff` and show it. Arm the kicker with `send_message`
  "KICK" to it. End the turn. If no kicker answers "armed", do not clear: say so and stop.
- **M4.** Maestro, on the kicker's "armed" reply (a new turn). Say the final summary and the note path, then call
  `clear_session` on `self` as the very last action of the turn. The app may ask Jack to approve the call.
- **M5.** Kicker. Poll `get_session` on the maestro every 10 s. After 3 checks in a row with `isRunning` false, send
  exactly `Arise`. Report the send time and result.
- **M6.** Maestro, on `Arise` (the first input of the cleared session). Run `digismith:handoff` in resume mode, then do the
  maestro's own refresh: fetch the latest `main`, rebuild the in-progress picture (tickets, tasks, live workers), show a
  summarized list of candidate next tasks, and stop. Jack chooses. Never act on the note's Next alone. The note has no age
  limit.
- **M7.** Jack. Delete the kicker. `delete_session` shows an approval card in every permission mode, so a flux cannot do
  it alone; Jack accepted the cost.

Order: arming (M3) and clearing (M4) are two turns, because the kicker's "armed" reply is a message, and a message that
arrives before a turn ends drops the queued clear. Fallback: if the kick is lost or held, Jack types `Arise` (or `resume`)
in the maestro and gets the same list.

If something goes wrong:

- The note write fails at M3: no arm and no clear. Report and stop.
- The clear is dropped (a message arrived before the turn ended): the kicker sends `Arise` into the old context. Harmless:
  the maestro says it did not clear. Run M4 again.
- Jack said yes but no kicker answers "armed": the maestro keeps its context and tells Jack. Jack opens the kicker and
  says go again, or clears without it and types `Arise` himself.
- The note is wrong: there is no gate, so Jack corrects the note on disk or says so after `Arise`. The maestro also
  rebuilds the picture from `main`, tickets and live workers.
- The kicker holds a wrong session id: it never sends. Its 15-minute limit ends it, and Jack types `Arise`.

#### The kicker instruction (template; the maestro fills in its own session id)

```
You are the kicker for a maestro flux. Never call clear_session, stop_session,
archive_session or delete_session, and do nothing except these steps.
1. Wait for the message KICK, then reply "armed".
2. Poll get_session on session <MAESTRO_SESSION_ID> every 10 s. When isRunning is
   false on 3 checks in a row, send_message to that session with exactly: Arise
   If 15 minutes pass with no idle session, stop and report "no clear seen".
3. Report the result line and the send time (UTC+7, UTC in brackets). Then stop.
```

#### Kicker options tested (2026-10-03)

- **Desktop session (route A'):** chosen. Passed 17:32 to 17:34 UTC+7 [10:32Z to 10:34Z] (DGS-154 comment
  `1301150000057188`). Cost: Jack opens it, pastes the instruction and deletes it.
- **Background subagent:** failed. `clear_session` kills it (exit 137 about 1 s after the turn ended, 17:45 UTC+7
  [10:45Z], comment `1301150000057204`).
- **Node `setInterval` process (spike):** detection works through `/root/.claude/sessions/<pid>.json` (status busy or
  idle, `hostSessionId`, a `sessionId` that changes at a clear). Delivery is unproven: the session's Unix socket speaks an
  undocumented versioned protocol, and `claude --resume --print` may lock against the live process. Not pursued. Files: the spike folder in "Names".
- **Not tested:** `notify_when_idle` as the wait, a herdr CLI worker as the kicker, and a kick that arrives while the
  maestro still runs (the queued clear would be dropped). These are build 2 candidates.
~~~~

- [ ] **Step 3: Replace lines 196-245 with the new block**

The replaced range starts at the line beginning `Switch lineage or ticket, which is a flux` and ends at the line before
`Emergency flux:`. Run this exact script (it refuses to write if an anchor is missing or repeated, and it keeps a copy of
the old file beside the original so nothing is lost):

```bash
python3 - <<'EOF'
import shutil, pathlib
runbook = pathlib.Path("/root/Workspace/Jazurite/DigiSmith/.digismith/sessions/workbox.md")
new = pathlib.Path("/tmp/claude-0/-root-Workspace-Jazurite-DigiSmith/f94b2d68-c3ce-41c2-a19a-f0139636696d/scratchpad/flux-runbook-section.md").read_text()
lines = runbook.read_text().split("\n")
start = [i for i, l in enumerate(lines) if l.startswith("Switch lineage or ticket, which is a flux")]
end = [i for i, l in enumerate(lines) if l.startswith("Emergency flux:")]
assert len(start) == 1 and len(end) == 1 and start[0] < end[0], (start, end)
shutil.copy(runbook, runbook.with_suffix(".md.before-flux"))
out = lines[:start[0]] + new.rstrip("\n").split("\n") + [""] + lines[end[0]:]
runbook.write_text("\n".join(out))
print("replaced lines", start[0] + 1, "to", end[0], "with", len(new.splitlines()), "lines")
EOF
```
Expected: `replaced lines 196 to 246 with N lines` (the numbers may differ if the maestro edited the file).

Then move the backup out of the sessions folder so the folder holds no stray copy:
`mkdir -p /root/Workspace/Jazurite/DigiSmith/.digismith/sessions/.old && mv /root/Workspace/Jazurite/DigiSmith/.digismith/sessions/workbox.md.before-flux /root/Workspace/Jazurite/DigiSmith/.digismith/sessions/.old/workbox.md.before-flux-2026-10-03`
Report the backup path to the maestro. Do not delete it.

- [ ] **Step 4: Rewrite the Flux definition (old lines 67-70)**

Use Edit with the exact old text
```
A **flux** is the cycle that renews a worker's session. The worker writes its handoff note, it exits (not `/clear`), the
maestro picks the account, and a fresh session starts from the note. Since 2026-10-03 (Jack) a worker has no `/clear` at all: its renewal is exit plus close the workspace (Step 10), and
the next ticket starts in a new workspace with a new agent. In a forge, flux strips the oxide and slag off the
metal so the weld holds clean. Here it strips the old context and keeps the join, which is the note.
```
and the new text
```
A **flux** is the cycle that renews a session; the protocol is "Flux protocol" below. A worker's flux is exit plus close
the workspace, and the next ticket starts in a new workspace with a new agent from the maestro's brief (no `/clear`, no
note, no resume). The maestro's flux is a clear plus a kicker session that wakes it with `Arise`. In a forge, flux strips
the oxide and slag off the metal so the weld holds clean. Here it strips the old context and keeps the join: for a worker
the brief, for the maestro its note.
```
If Edit reports the old text is not found, the maestro changed it: re-read lines 65-73 and merge by hand, keeping the new meaning.

- [ ] **Step 5: Rewrite "When to choose" (old lines 77-84)**

Use Edit with the exact old text
```
Choose the account at these three flux points:

1. **A new worker starts** in a slot (the first flux).
2. **A worker switches lineage or ticket** (a flux). After its handoff, exit it and start a new session. Each of these
   first two is a cold-cache point, so the choice costs no re-read.
3. **A limit stop** (an emergency flux) on the worker's account ("You've hit your session limit"). This is the only move in the middle of a
   session: exit, load another account, then start with `--resume <session id>`. It costs one full re-read and loses a
   running subagent. The exhausted account is dropped from the choice.
```
and the new text
```
Choose the account at these two points:

1. **A new worker starts a ticket** (S1). Every ticket gets a new worker in a new workspace, so each start is a cold-cache
   point and the choice costs no re-read.
2. **A limit stop** (the emergency flux) on the worker's account ("You've hit your session limit"). This is the only move in
   the middle of a session: exit, load another account, then start with `--resume <session id>`. It costs one full
   re-read and loses a running subagent. The exhausted account is dropped from the choice.
```
Also in "Do not choose" nothing changes. Search the file for the words "three flux points" and "the first two": `grep -n "three flux points\|first two" .digismith/sessions/workbox.md`. Expected: no match.

- [ ] **Step 6: Mark the emergency flux as an exception**

Replace the lead-in of the "Emergency flux:" paragraph
`Emergency flux: move a worker to another account mid-session only at a limit stop`
with
`Emergency flux (an exception to "no reused pane" until Jack decides if it stays): move a worker to another account mid-session only at a limit stop`
Keep the numbered steps under it unchanged.

- [ ] **Step 7: Replace the Notes bullet about resuming a worker**

Replace the three lines
```
- Kick a cleared worker with the lineage key in the text: `herdr agent prompt <agent> "resume lineage <key>" --wait`.
  A terminal session cannot read its own title, so a plain `resume` makes the handoff skill ask which lineage
  (DGS-120).
```
with
```
- A worker has no resume (Flux protocol, 2026-10-03): it starts from the maestro's brief. The old `resume lineage <key>`
  kick is gone.
```

- [ ] **Step 8: Verify the runbook against the design tables**

Run, from `/root/Workspace/Jazurite/DigiSmith`:
`grep -c "^- \*\*W[123]\.\|^- \*\*S[0-6]\.\|^- \*\*M[1-7]\." .digismith/sessions/workbox.md`
Expected: `17` (W1 to W3 = 3, S0 to S6 = 7, M1 to M7 = 7).

`grep -n "resume lineage\|Continue with Next\|three flux points\|Step 10\|Check Gate waits" .digismith/sessions/workbox.md`
Expected: only the Notes line from Step 7 (which says the old kick is gone) and historical lines in the roster table (for example the line 33 "Superseded ... Step 10" note). No instruction still tells the maestro to use any of these. If a live instruction remains, fix it.

Run: `git check-ignore -v .digismith/sessions/workbox.md; git status --short .digismith/sessions`
Expected: the runbook is ignored or untracked and nothing under `.digismith/sessions` shows as staged.

Read the new block once against design sections 4 to 7: every step has an owner; W1 to W3, S0 to S6 and M1 to M7 match; the kicker template matches section 7 word for word.

- [ ] **Step 9: No commit**

The runbook is untracked on purpose. Do not `git add` it. Report to the maestro: the scratch path, the backup path under `.digismith/sessions/.old/`, and the verification output.

---

### Task 4: Build 1 verification

**Files:**
- No file changes. Read-only checks, then a report.

**Interfaces:**
- Consumes: Tasks 1 to 3.
- Produces: the evidence the maestro needs for checkpoint 4, and the input for the live run (design section 11).

- [ ] **Step 1: Regression run**

Run: `cd /root/Workspace/Jazurite/DigiSmith/.worktrees/flux-protocol && pnpm test 2>&1 | tail -8`
Expected: the same pass count as the baseline from Task 1 Step 1, no failures. (`scripts/lineage-handoff.test.ts` and `scripts/session-init.test.ts` are unchanged and must stay green.)

- [ ] **Step 2: Skill text against Jack's rule**

Run: `grep -rn "Continue with Next\|Continue with <Next>" skills/ ; echo "exit $?"`
Expected: no match, `exit 1`.

Run: `sed -n '/^## Resume Mode/,/^## Note Format/p' skills/handoff/SKILL.md`
Expected: step 4 shows candidates and asks; no sentence starts work on a resume.

- [ ] **Step 3: Finishing skill options**

Run: `git diff main -- skills/finishing-a-development-branch/SKILL.md`
Expected: only the Step 7 clause and the Quick Reference half-sentence differ; Options 1, 2 and 3 and Steps 1 to 6 are byte-identical.

- [ ] **Step 4: Branch state**

Run: `git status --short; git log --oneline main..HEAD`
Expected: a clean worktree; commits are the design, the design fixes, this plan, and Tasks 1 and 2 (title-only messages). Run `git log --format='%B' main..HEAD | grep -ic "co-authored\|generated with"`; expected `0`.

- [ ] **Step 5: Report, do not push**

Report to the maestro: the baseline and final test lines, the grep results, the commit list, the backup path of the runbook. Say that the live run of the maestro flux (design section 11: a Desktop kicker, M1 to M7, `Arise` produces a list and not an action) needs Jack and the maestro, and that nothing is pushed. Wait for "approved: push" (checkpoint 4).

---

# Part B: after DGS-158 (follow-up checklist, not a gate)

DGS-158 (Jack, 21:53 UTC+7 [14:53Z]) moves to ticket-based naming: ticket files under `.digismith/board`, maestro, worker and other sessions under `.digismith/sessions/`. **Part A does not wait for it** (Jack, 21:59 UTC+7 [14:59Z]). Part B lists what the DGS-158 follow-up must change after Part A has shipped with the interim names. Each task is small because Part A put every name and path in one place. Do Part B when DGS-158's design is approved, as its own follow-up change.

### Task 5 (after DGS-158): Update the design to the new names and paths

**Files:**
- Modify: `.digismith/docs/E/E.4/flux-protocol/design.html`

**Interfaces:**
- Consumes: DGS-158's approved design (the worker name, the docs folder, the brief location, the note location).
- Produces: a design whose interim items are final. Tasks 6 and 7 follow it.

- [ ] **Step 1: List every site that names a clan, lineage or docs folder**

Run: `grep -n "Clan\|lineage\|Lineage\|docs/E\|E\.4\|E\.3\|dgs-<\|short name\|handoff\.md" .digismith/docs/E/E.4/flux-protocol/design.html`
Expected sites (from the design review of 2026-10-03): the footer path; S0 (docs folder); S2 and S4 (label, agent name); S5 and the callout under it ("no lineage key", "which lineage"); section 7 (the spike path); section 8 (the skill's key-match rule, the SessionStart clause, the cleanup-round "pointers to other lineages"); section 9 item 1; section 11 (the lineage tests); section 13 (the interim rows and the E.3 reference).

- [ ] **Step 2: Rewrite each site to the DGS-158 outcome**

Replace each interim value with the decided one, change every "interim" tag on it to "decided (DGS-158)", and update the Status line in the header. Leave the protocol steps W1 to W3, S1 to S4, S6 and M1 to M7 unchanged unless DGS-158's outcome changes their commands.

- [ ] **Step 3: Verify and commit**

Run: `grep -n "interim\|Interim" .digismith/docs/E/E.4/flux-protocol/design.html`
Expected: no remaining item that DGS-158 settled.

```bash
git add .digismith/docs/E/E.4/flux-protocol/design.html
git commit -m "docs(flux): update the design to the DGS-158 names and folders"
```

---

### Task 6 (after DGS-158): Update the runbook names and locations

**Files:**
- Modify (untracked, never commit): `/root/Workspace/Jazurite/DigiSmith/.digismith/sessions/workbox.md`

**Interfaces:**
- Consumes: DGS-158's design; Task 3's "Names" block.
- Produces: the runbook with final names.

- [ ] **Step 1: Rewrite the "Names" block**

It is the only block in the protocol that names a label, an agent or a folder (see Task 3). Replace its bullets with the DGS-158 values and rename the heading to "Names". Where the DGS-158 outcome moves ticket files to `.digismith/board` and sessions to `.digismith/sessions/`, update the brief location (S0, S5) and the docs folder wording.

- [ ] **Step 2: Update the tables that carry names**

Update the roster (slot) table, the live-workers table and any "Last assigned" text that uses `<key>: <ticket> <name>`-style names, to the DGS-158 form, for workers started from now on. Leave the history rows as they were.

- [ ] **Step 3: Verify**

Run: `grep -n "Clan\.N\|<Clan>\|resume lineage\|interim" .digismith/sessions/workbox.md`
Expected: no live instruction still uses the interim names. No commit: the runbook stays untracked.

---

### Task 7 (after DGS-158): The note location and lookup in `digismith:handoff`

**Files:**
- Modify: `skills/handoff/SKILL.md` (Overview note-path table, Invoked By SessionStart key-match, The Script, Resolve the Note, Resume Mode step 2, Rationalizations title row, the cleanup-round line "that lineage's session got a pointer message"); `skills/finishing-a-development-branch/SKILL.md` (Step 7 sentence "writes this lineage's handoff note")
- Modify (only if DGS-158 changes them): `scripts/lineage-handoff.ts`, `scripts/session-init.ts`
- Test (only if the scripts change): `scripts/lineage-handoff.test.ts`, `scripts/session-init.test.ts`

**Interfaces:**
- Consumes: DGS-158's decisions on where the maestro's note and other sessions' notes live (under `.digismith/sessions/`), and whether a session title still maps to a key.
- Produces: the maestro's note location that M3 writes and M6 reads.

- [ ] **Step 1: Write the exact steps when DGS-158's design is approved**

The new note location, the title lookup and the SessionStart line are DGS-158's decisions, so this task is a checklist of what changes, with the exact edits written then, in the format of Tasks 1 and 2 (failing test first for any script change, then the change, then the commit). Part A ships without it: the maestro's note keeps working with today's lookup.

- [ ] **Step 2: Items to settle in that follow-up**

- Where the maestro's note is written and read, and what its filename is (M3 and M6 depend on it).
- Whether a session title still maps to a key, or the note is found another way; the SessionStart line `DigiSmith: lineage handoff notes in ...` and the "or say resume" wording in `scripts/session-init.ts` (line 29); the SessionStart worker clause added in Task 1.
- Whether `lineage-handoff.ts --action path|ensure-excluded|list` keeps its three actions.
- The exclude pattern `.digismith/docs/**/handoff.md` in `.git/info/exclude`, if the notes move.

---

## Self-Review

**1. Spec coverage** (design section → task):
- 3 Rules → Task 3 (the six runbook rules); the skill rules in Tasks 1 and 2.
- 4 Worker flux → Task 3 (W1 to W3), Task 2 (Step 7).
- 5 Start of a ticket → Task 3 (S0 to S6); the naming parts are isolated in "Names" and finalised in Tasks 5 and 6.
- 6 Maestro flux → Task 3 (M1 to M7, Order, Fallback), Task 1 (Check Gate exception, Clear Decision).
- 7 Kicker instruction and options tested → Task 3.
- 8 The A.1 skill change → Task 1 (all six bullets except the lookup), Task 2, Task 7 (the lookup).
- 9 The runbook spec items 1 to 5 → Task 3 (item 1 the protocol block; item 2 M1 to M4 and the fallback; item 3 W1 and W2, the reusable-slot note already at line 33; item 4 the template and the options; item 5 Step 6, the emergency flux marked as an exception).
- 10 Failure modes → Task 3 ("If something goes wrong").
- 11 How build 1 is checked → Task 4 (the live run is the maestro's, stated in Step 5).
- 12 Out of scope → the Global Constraints.
- 13 Open and interim items → Part B.
- Gap found and fixed: none left. The design's "Proposed" items (SessionStart clause, template in the runbook, 15-minute limit, `session-init.ts` unchanged) are in Tasks 1 and 3 and are labelled proposed in the design, so Jack can still overrule them.

**2. Placeholder scan:** no "TBD" or "similar to Task N" in Part A. Task 7 Step 1 is a checklist, not exact steps, because its content is DGS-158's decision; it is Part B and does not block Part A.

**3. Consistency:** the trigger word is `Arise` in Tasks 1, 3 and the template; the question text is "kicker open? flux now?" in Tasks 1 and 3; the Task 2 clause text equals design section 8's wording; the step IDs W1 to W3, S0 to S6 and M1 to M7 match the design.

## Execution handoff

Do not start until the maestro sends "approved" for this plan (checkpoint 3). Part A has four tasks, so the writing-plans rule picks subagent-driven development, but the maestro's own rule (a worker builds, a maestro does not run builds itself) and the untracked runbook in Task 3 mean the maestro may prefer inline execution by this worker. The maestro decides at approval.
