---
name: handoff
description: Use when the user asks to hand off, wrap up, checkpoint, "save where we are", start fresh, or clear context — writes this lineage's living handoff note (Done / Decisions / Next / Open problems) and clears the session only when asked. Also use when the user says "resume" or "pick up where we left off", and when digismith:finishing-a-development-branch Step 7 hands off at the end of a ticket.
---

# Handoff

## Overview

The last stage of DigiSmith's ticket workflow, and a checkpoint you can take at any time. Each
lineage keeps one living note that says where the lineage stands now:

```
.digismith/docs/<Clan>/<Lineage>/handoff.md    title "A.0: Primitives"  → A/A.0
.digismith/docs/<Clan>/handoff.md              title "K: Maestro"       → K
.digismith/docs/_unlettered/handoff.md         any other title
```

Every handoff rewrites the whole note. The next session of the lineage finds it from its own
session title. Keep it short: the code, plan, and report carry the rest.

Two modes:

- **Write** (default): compose the note, write it, show it, and clear the session only when that
  was asked for. **End-of-ticket mode** is write mode called by
  `digismith:finishing-a-development-branch` Step 7; it adds the cleanup round below and lets
  the `clear_context` preference decide the clear.
- **Resume**: read this lineage's note and pick the work back up.

## Invoked By

- The human partner, at any time:
  - write: "hand off", "handoff", "wrap up", "save where we are", "checkpoint"
  - write, then clear: "hand off and clear", "start fresh", "clear context"
  - resume: "resume", "pick up where we left off"
- `digismith:finishing-a-development-branch` Step 7, after Option 1 or Option 2 (write,
  end-of-ticket mode).
- A `SessionStart` line `DigiSmith: lineage handoff notes in ...` (resume).

## The Script

`<digismith-root>` is two levels up from this skill's base directory (shown when the skill
loads). Use this copy, not a path asked from the human partner: the script and this text ship
together in one plugin version.

```bash
node --experimental-strip-types <digismith-root>/scripts/lineage-handoff.ts --action path --title "<session title>"
node --experimental-strip-types <digismith-root>/scripts/lineage-handoff.ts --action ensure-excluded --title "<session title>"
node --experimental-strip-types <digismith-root>/scripts/lineage-handoff.ts --action list
```

Run them from the repo being worked in: its main checkout or any of its worktrees. The script
resolves the main checkout itself, so the note always lands in the main checkout's
`.digismith/docs/`. `<main-root>` below is the note path up to `/.digismith/docs/`.

## Resolve the Note

1. Call `mcp__ccd_session_mgmt__get_session` with `session_id: "self"` and read `title`.
2. Run `--action path --title "<title>"`. The printed absolute path is this session's note.
3. If the path is under `_unlettered`, say so in the reply, so a wrong title is noticed.
4. If `get_session` fails or there is no title, ask which lineage this is (e.g. `A.0`) and pass
   `--title "<answer>:"`. Do not guess: a wrong key overwrites another lineage's note.

## Write Mode

1. Resolve the note.
2. If the note already exists, read it. Carry forward only what is still true, typically
   open problems not yet solved and decisions that still hold.
3. Compose the note (see Note Format). Sources: this conversation; any plan ledger or
   `progress.md` for status (cross-check it, do not restate status from memory). For the header,
   run `git branch --show-current` and `git -C <main-root> rev-parse --short HEAD`.
4. **End-of-ticket mode only: the cleanup round.**
   - Sweep the conversation for unresolved threads: a pending question, a task mentioned but not
     started, something asked to be revisited.
   - Check each item that applies here:
     - DigiSmith's own repo (`.claude-plugin/plugin.json` names `digismith`): the lineage's row
       in `MEMORY.md` records this ticket.
     - The ticket is a ClickUp task (a `DGS-` key): its progress comment for this checkpoint is
       posted.
     - Something was filed under another lineage: that lineage's session got a pointer message.
   - Put every open thread and every missing item under Open problems, one line each. Do not do
     the chores themselves.
5. Run `--action ensure-excluded --title "<title>"`.
6. Write the whole note to the resolved path. If the write fails, report it, do not clear, and
   stop.
7. Show the note in the reply.
8. Decide whether to clear (next section).

## Clear Decision

**Manual run:** clear only if this message asked for it ("hand off and clear", "start fresh",
"clear context"). Otherwise stop after showing the note.

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
2. If it does not exist, say "No handoff note for this lineage at `<path>`." and stop. Do not read
   another lineage's note instead.
3. Read it. If the header has `main @ <sha>`, run
   `git -C <main-root> rev-list --count <sha>..HEAD` and report how many commits `main` has
   gained since the note. Skip this if the SHA is missing or unknown.
4. State Done and Next in a few lines, then ask "Continue with <Next>?" Do not start it without a
   go: days may have passed, and another session may have moved things.

## Note Format

```markdown
# <one line: what this lineage is doing>
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
| "The note looks fine, I can skip the check" | Every clear waits for the human partner's ok or fixes. |
| "The title has no prefix; I can tell the lineage from the work" | A wrong key overwrites another lineage's note. An unmatched title goes to `_unlettered`; no title means ask. |
| "I'll append today's work under the old note" | Rewrite the whole note. Carry forward only what is still true. |
| "The write failed, but I'll clear anyway" | The note is the only state that survives the clear. No note, no clear. |
| "Resume found a note, so I'll start on Next" | Ask first. Days may have passed, and another session may have moved things. |
| "While wrapping up I'll also update MEMORY and ClickUp" | The cleanup round checks and lists gaps. It does not do those chores. |
