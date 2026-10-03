---
name: handoff
description: Use when the user asks to hand off, wrap up, checkpoint, "save where we are", start fresh, or clear context — writes this session's living handoff note (Done / Decisions / Next / Open problems) and clears the session only when asked. Also use when the user says "resume", "Arise" or "pick up where we left off", and when digismith:finishing-a-development-branch Step 7 hands off at the end of a ticket.
---

# Handoff

## Overview

The last stage of DigiSmith's ticket workflow, and a checkpoint you can take at any time. Each
maestro session keeps one living note that says where the session stands now:

```
.digismith/sessions/<session-name>/note.md     title "DigiSmith"        → DigiSmith  (current)
.digismith/docs/<Clan>/<Lineage>/handoff.md    title "A.1: Primitives"  → A/A.1      (fallback)
.digismith/docs/<Clan>/handoff.md              title "K: Maestro"       → K          (fallback)
.digismith/docs/_unlettered/handoff.md         any other title          (fallback)
```

The first line is the convention of DGS-158. The three fallback lines are the old clan and
lineage notes: the script, the SessionStart line and the exclude patterns still know only those
until DGS-159 migrates them, so this skill text and `scripts/lineage-handoff.ts` differ on
purpose. The fallback keeps existing notes working.

Every handoff rewrites the whole note. The next session with the same name finds it from its own
session title. Keep it short: the code, plan, and report carry the rest.

Two modes:

- **Write** (default): compose the note, write it, show it, and clear the session only when that
  was asked for. **End-of-ticket mode** is write mode called by
  `digismith:finishing-a-development-branch` Step 7; it adds the cleanup round below and lets
  the `clear_context` preference decide the clear.
- **Resume**: read this session's note, show where it stands and the candidate next steps, and ask which one to take. A resume never starts work.

## Invoked By

- The human partner, at any time:
  - write: "hand off", "handoff", "wrap up", "save where we are", "checkpoint"
  - write, then clear: "hand off and clear", "start fresh", "clear context"
  - resume: "resume", "Arise", "pick up where we left off"
- `digismith:finishing-a-development-branch` Step 7, after Option 1 or Option 2 (write,
  end-of-ticket mode).
- A `SessionStart` line `DigiSmith: lineage handoff notes in ...` — resume, but only when this
  session's own key (from its title, same mapping as the Overview table) is among the keys the
  line lists. Otherwise ignore the line silently: no lookup, no mention of it. Also ignore it
  in a worker the maestro started with a brief (its first message tells it to read a brief
  file): a worker has no note and no resume. That line is built by the script and lists only
  fallback notes: a note at `.digismith/sessions/<session-name>/note.md` is found by "resume" or
  "Arise", not by that line.

## The Script

`<digismith-root>` is two levels up from this skill's base directory (shown when the skill
loads). Use this copy, not a path asked from the human partner: the script and this text ship
together in one plugin version.

```bash
node --experimental-strip-types <digismith-root>/scripts/lineage-handoff.ts --action path --title '<session title>'
node --experimental-strip-types <digismith-root>/scripts/lineage-handoff.ts --action ensure-excluded --title '<session title>'
node --experimental-strip-types <digismith-root>/scripts/lineage-handoff.ts --action list
```

Wrap the title in single quotes, and write any `'` inside it as `'\''`.

The script only knows the fallback paths. `<main-root>` is the main checkout (the script
resolves it for the fallback; for the current path use
`git rev-parse --path-format=absolute --git-common-dir` and take its parent directory).

Run them from the repo being worked in: its main checkout or any of its worktrees. The fallback
note lands in the main checkout's `.digismith/docs/`, the current note in its
`.digismith/sessions/`.

## Resolve the Note

1. Call `mcp__ccd_session_mgmt__get_session` with `session_id: "self"` and read `title`; that is
   the session name. If the call fails or the title is empty or blank, go to step 5.
2. If the name is one safe path segment (non-empty, no `/` or `\`, not `.` or `..`, and not a
   lineage-key title matching `^\s*[A-Z](\.\d+)?\s*(:|$)`, like "A.1: Primitives" or "K:
   Maestro"), the current note path is `<main-root>/.digismith/sessions/<name>/note.md`. If git
   tracks that path (`git -C <main-root> --literal-pathspecs ls-files --error-unmatch -- <relative path>` exits 0),
   stop: tell the human partner a file committed to git sits there which this skill did not
   write, and do not read or write it.
3. Write mode writes to the current path. Resume mode reads the current note if it exists, and
   otherwise falls back: run `--action path --title '<title>'` and use that old note if it
   exists. If that command fails because the fallback path is tracked by git, stop and tell the
   human partner the same, and do not read or write it. Write mode has the same stop whenever it
   runs `--action path`. A fallback note found for a safe name may belong to another session
   (the `_unlettered` note is shared), so say where it came from when showing it.
4. If the title is not blank but is not one safe path segment (or it is a lineage-key title), use
   the fallback path from `--action path` for both modes, exactly as before, with the same stop if
   git tracks it. If that path is under `_unlettered`, say so in the reply, so a wrong title is
   noticed.
5. If `get_session` fails or there is no title, run `--action list`, list the folders under
   `.digismith/sessions/` that hold a `note.md`, and ask which session this is. Pass an answer
   that is a fallback key as before (`A/A.1` → `--title 'A.1:'`). Do not guess: a wrong name
   overwrites another session's note.

## Write Mode

1. Resolve the note.
2. A worker the maestro started with a brief writes no note: if this session's first message
   told it to read a brief file, say so and stop. Otherwise, if the current note exists, read
   it; if only the fallback note exists (path from `--action path`), read that one, and say it
   came from the fallback, because the `_unlettered` note is shared and may belong to another
   session. Carry forward only what is still true and belongs to this session, typically
   open problems not yet solved and decisions that still hold.
3. Compose the note (see Note Format). Sources: this conversation; any plan ledger or
   `progress.md` for status (cross-check it, do not restate status from memory). For the header,
   run `git branch --show-current` and `git -C <main-root> rev-parse --short HEAD`.
4. **End-of-ticket mode only: the cleanup round.**
   - Sweep the conversation for unresolved threads: a pending question, a task mentioned but not
     started, something asked to be revisited.
   - Check each item that applies here:
     - DigiSmith's own repo (`.claude-plugin/plugin.json` names `digismith`): this session's row
       in `MEMORY.md` records this ticket.
     - The ticket is a ClickUp task (a `DGS-` key): its progress comment for this checkpoint is
       posted.
     - Something was filed for another session: that session got a pointer message.
   - Put every open thread and every missing item under Open problems, one line each. Do not do
     the chores themselves.
5. For the fallback path, run `--action ensure-excluded --title '<title>'` as before. For the
   current path, run `git -C <main-root> check-ignore -q --no-index <relative path>`; if it is
   not ignored, say in the reply that the path is not git-excluded here yet (DGS-159 adds the
   pattern) and that it must not be committed.
6. Create the parent folder of the current path, then write the whole note to the resolved path.
   If the write fails, report it, do not clear, and stop.
7. Show the note in the reply.
8. Decide whether to clear (next section).

## Clear Decision

**Manual run:** clear only if this message asked for it ("hand off and clear", "start fresh",
"clear context"). The human partner's yes to your own question "kicker open? flux now?"
writes and shows the note without the gate (see the exception under Check Gate), but this
skill does not clear on it; the flux procedure clears on its next turn. Otherwise stop after
showing the note.

**End-of-ticket mode:** invoke `digismith:preferences`' `get` operation for key `clear_context`.

- **`unset`**: go to the check gate, and add two questions to its message: "Clear this session
  now that the ticket is done? And remember that answer as this repo's default?" On the reply, if
  the second answer is yes, write `clear_context` (`yes` or `no`, matching the first answer) with
  `digismith:preferences`' `set` operation. A no to the first question means no clear.
- **`yes`**: if this run's message says "don't clear", "keep going", or "not this time", do not
  clear; the saved value is untouched. Otherwise announce "Using saved default for this repo:
  clearing after you check the note. Say 'don't clear' to keep going." and go to the check gate.
- **`no`**: if this run's message says "clear context" or "start fresh", go to the check gate;
  the saved value is untouched. Otherwise do not clear.

## Check Gate

Every clear waits for the human partner to check the note. End the turn with the note shown and:
"Fix anything, or say ok to clear."

**One exception:** when the message you are answering is the human partner's yes to your own
question "kicker open? flux now?", skip the gate. Write the note and show it, but do not
clear: the flux procedure arms the kicker and clears on its next turn, after the kicker
replies "armed". The question and the yes are the signal; no other wording
counts, and every other clear, including a "hand off and clear" the human partner types,
keeps the gate.

On the next message:

- **ok / yes:** clear.
- **Corrections:** rewrite the note with them, show what changed, then clear.
- **Anything else** (new work, a question, "don't clear"): do not clear. The note stays written;
  handle the message normally.

To clear: first say the final summary (what is done, what is next, `Handoff note: <path>`), then,
as the last action of the turn, call `mcp__ccd_session_mgmt__clear_session` with
`session_id: "self"`. The clear takes effect when the turn ends and the session goes idle. A
message that arrives before then drops the queued clear; that is expected. If `clear_session` is
not available (plain CLI, no desktop app), tell the human partner to run `/clear`.

## Resume Mode

1. Resolve the note.
2. If it does not exist, say "No handoff note for this session" and name every path tried (the
   current path for a safe name, the fallback path when one was tried) and stop. Do not read another session's note instead.
3. Read it. If the header has `main @ <sha>`, run
   `git -C <main-root> rev-list --count <sha>..HEAD` and report how many commits `main` has
   gained since the note. Skip this if the SHA is missing or unknown.
4. State Done in a few lines. Show Next and the open problems as a short numbered list of
   candidates, and ask which one to take. Start nothing before the answer: days may have
   passed, and another session may have moved things.

## Note Format

```markdown
# <one line: what this session is doing>
Updated <UTC time, e.g. 2026-09-26T10:40Z> · branch <current branch> · main @ <short sha>

## Done
<What is finished. Point at the report or commits; do not restate them.>

## Decisions
<Choices made and why, that the code does not show. "None" if none.>

## Next
<The next concrete action, exact enough for a cold session.
Last line: the literal command or skill call, when there is one.>

## Open problems
<Unresolved threads, deferred items with their id or link, cleanup gaps. "None" if none.>
```

The first line is always the H1 title. Exactly these four sections, in this order.

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "The ticket's done, they'd obviously want a fresh start" | Only an explicit ask or a saved `yes` clears. Never infer it. |
| "I'll clear now and summarize after" | The clear drops everything after this turn. Summary first, clear last. |
| "The note looks fine, I can skip the check" | Every clear waits for the human partner's ok or fixes. The only exception is the yes to "kicker open? flux now?", which skips the gate but still does not clear here (Check Gate). |
| "The title has no prefix; I can tell the session from the work" | A wrong name overwrites another session's note. A title that is not one safe name goes through the fallback; no title means ask. |
| "I'll append today's work under the old note" | Rewrite the whole note. Carry forward only what is still true. |
| "The write failed, but I'll clear anyway" | The note is the only state that survives the clear. No note, no clear. |
| "Resume found a note, so I'll start on Next" | Ask first. Days may have passed, and another session may have moved things. |
| "While wrapping up I'll also update MEMORY and ClickUp" | The cleanup round checks and lists gaps. It does not do those chores. |
