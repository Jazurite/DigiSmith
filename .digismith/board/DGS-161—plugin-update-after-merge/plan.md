# Plugin Update After a Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix hook 02's plugin-update command and cache-flush behavior, drop the classifier-blocked `ssh_key` read from hooks 01 and 03, and give Jack a written, non-asserting reload step plus a live test procedure for the maestro to run later (DGS-161).

**Architecture:** Three existing `post-finish` hook files are text (agent-followed instructions, not executed scripts) — each edit is a direct, surgical replacement of one block inside its Markdown body. A fourth new file is a plain copy of the design doc's test-procedure section into its own short doc, so Jack can run the live test without re-reading the whole design.

**Tech Stack:** Markdown hook files under `.digismith/hooks/post-finish/`, bash command blocks inside them. No TypeScript, no new scripts, no test runner involved — verification is read-back of the edited files against this plan's exact expected content.

## Global Constraints

- Change only `.digismith/hooks/post-finish/01-version-bump.md`, `02-plugin-reinstall.md`, `03-history-update.md`, and one new file in the board folder. No other file changes anywhere in the repo.
- Do not touch `skills/finishing-a-development-branch/SKILL.md`, `skills/bootstrap/SKILL.md`, `skills/adopt/SKILL.md`, `skills/preferences/SKILL.md`, or `MEMORY.md` — all five still read/use `ssh_key` and are explicitly out of scope (design doc, "Out of scope").
- Do not touch anything under `backlog/` or `.digismith/docs/` — a parallel ticket (DGS-159) is mid-flight moving those paths.
- Do not touch `.digismith/hooks/post-finish/scripts/` (the `.ts` scripts and their tests) — this ticket only changes the three hook `.md` files' own bash blocks, never the scripts they call.
- The cache-flush removal must leave **no** automatic deletion of any directory under `~/.claude/plugins/cache/jazurite/digismith/` — verify by reading the edited file back, not by running it.
- Hooks 01 and 03 must end up byte-identical in their SSH-related change (same deleted lines, same new push line, same new sentence) — they share the exact same `SSH_KEY=...`/`if`/`else` pattern today.

---

### Task 1: Fix hook 02 (update command, drop the cache flush, provisional reload wording)

**Files:**
- Modify: `.digismith/hooks/post-finish/02-plugin-reinstall.md`

**Interfaces:**
- Consumes: nothing from another task — self-contained file edit.
- Produces: nothing another task reads — hooks 01/03 (Task 2) and the test-procedure doc (Task 3) are independent of this file's content.

- [ ] **Step 1: Read the current file to confirm line numbers before editing**

Run: `cat -n .digismith/hooks/post-finish/02-plugin-reinstall.md`

Expected: the command chain on the line matching `claude plugin marketplace update jazurite && claude plugin install digismith@jazurite --scope user`, the cache-flush block (`CURRENT_VERSION=...` through the closing `fi` of the `for dir in "$CACHE_DIR"/*/` loop), and the closing reminder block (`Then print this reminder plainly:` through the final paragraph) are all still present exactly as read during design.

- [ ] **Step 2: Replace the update command**

Change:

```bash
claude plugin marketplace update jazurite && claude plugin install digismith@jazurite --scope user
```

to:

```bash
claude plugin marketplace update jazurite && claude plugin update digismith@jazurite --scope user
```

- [ ] **Step 3: Remove the cache-flush block**

Delete this entire block (the paragraph introducing it, the code fence, and the paragraph explaining it):

```markdown
Then flush superseded cache versions — `claude plugin install` writes the new version alongside
any previous one rather than replacing it in place, and nothing else removes the old directory,
so left alone they accumulate indefinitely:

```bash
CURRENT_VERSION=$(node -e "console.log(require('$MAIN_ROOT/.claude-plugin/plugin.json').version)")
CACHE_DIR="$HOME/.claude/plugins/cache/jazurite/digismith"
if [ -n "$CURRENT_VERSION" ] && [ -d "$CACHE_DIR" ]; then
  for dir in "$CACHE_DIR"/*/; do
    version_dir=$(basename "$dir")
    if [ "$version_dir" != "$CURRENT_VERSION" ]; then
      rm -rf "$dir"
    fi
  done
fi
```

`CURRENT_VERSION` is read from `$MAIN_ROOT`'s own `plugin.json` — already reflecting
`01-version-bump.md`'s bump by the time this hook fires — never hardcoded or guessed. The guard
against an empty `$CURRENT_VERSION` matters: without it, a parse failure would make every
sibling directory look "superseded" and delete the version that was just installed too. This
only ever touches `$CACHE_DIR`'s own immediate subdirectories, never anything outside DigiSmith's
own cache path. If this step fails for any reason, say so plainly — a stale cache directory left
behind is not worth stopping the hook over, but it should not pass silently either.
```

Replace it with this single paragraph (no code fence — this is a plain statement, not a command
to run):

```markdown
Cache flush skipped on purpose. Old version directories under
`~/.claude/plugins/cache/jazurite/digismith/` are never deleted by this hook — a running session
may still be loading its skills from one of them, and there is no signal yet for "no session uses
this version anymore." See `backlog/auto-update-plugin-after-merge.md`, point 3. Clear old
versions by hand if disk space becomes a problem.
```

- [ ] **Step 4: Replace the closing reminder**

Change the final reminder block from:

```markdown
Then print this reminder plainly:

> "DigiSmith's plugin cache has been refreshed to the latest merge. Any other Claude Code
> sessions already running on this machine won't see this update until restarted."

This session's own tools already reflect the change (files are re-read from disk on each use) —
the reminder is for any *other*, already-running session on this same machine, which loaded its
skill list at its own start and has no way to hot-reload a plugin.
```

to:

```markdown
Then print this reminder plainly:

> "DigiSmith's plugin cache has been refreshed to the latest merge. Any other live session on
> this machine can try `/reload-plugins` to pick this up without restarting — if the skill text
> stays stale after that, restart that session instead. For a herdr worker pane:
> `herdr agent prompt <agent> "/reload-plugins"`. Untested on the Desktop maestro: it is a
> remote session, and the CLI has a separate message, "/reload-plugins isn't available over a
> remote connection in this session," that may apply there — treat the maestro's own reload path
> as unverified until tested separately (see the live test procedure in this ticket's board
> folder)."

This session's own tools already reflect the change (files are re-read from disk on each use) —
the reminder is for any *other*, already-running session on this same machine, which loaded its
skill list at its own start and has no built-in guarantee that `/reload-plugins` actually applies
a marketplace plugin's version bump without a restart.
```

- [ ] **Step 5: Verify the edit**

Run: `cat .digismith/hooks/post-finish/02-plugin-reinstall.md`

Expected: the file contains `claude plugin update digismith@jazurite --scope user` (not
`install`), contains no `rm -rf "$dir"` anywhere, contains the "Cache flush skipped on purpose"
paragraph, and contains the new reminder text with `/reload-plugins` and the "Untested on the
Desktop maestro" sentence. No `CURRENT_VERSION` or `CACHE_DIR` variable appears anywhere in the
file.

- [ ] **Step 6: Commit**

```bash
git add .digismith/hooks/post-finish/02-plugin-reinstall.md
git commit -m "fix(hooks): update instead of install, skip the unsafe cache flush"
```

---

### Task 2: Drop the ssh_key read from hooks 01 and 03

**Files:**
- Modify: `.digismith/hooks/post-finish/01-version-bump.md`
- Modify: `.digismith/hooks/post-finish/03-history-update.md`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: nothing another task reads.

- [ ] **Step 1: Read both files to confirm the shared pattern before editing**

Run: `cat -n .digismith/hooks/post-finish/01-version-bump.md .digismith/hooks/post-finish/03-history-update.md`

Expected: both files contain the identical five-line pattern:

```bash
  SSH_KEY=$(node --experimental-strip-types scripts/preferences.ts --key ssh_key --action get)
  git add <files> && \
  git commit -m "<message>" -- <files> && \
  if [ -n "$SSH_KEY" ] && [ "$SSH_KEY" != "unset" ]; then
    GIT_SSH_COMMAND="ssh -i '$SSH_KEY'" git push origin <base-branch>
  else
    git push origin <base-branch>
  fi
```

(`<files>`, `<message>` differ between the two files — `01` commits
`.claude-plugin/plugin.json .claude-plugin/marketplace.json` with message
`"chore: bump plugin version"`; `03` commits `.digismith/history.html` with message
`"docs(history): record shipped features"`. The `SSH_KEY`/`if`/`else`/push shape is identical in
both.)

- [ ] **Step 2: Edit `01-version-bump.md`**

Change:

```bash
if [[ "$BUMP_OUTPUT" == BUMPED* ]]; then
  SSH_KEY=$(node --experimental-strip-types scripts/preferences.ts --key ssh_key --action get)
  git add .claude-plugin/plugin.json .claude-plugin/marketplace.json && \
  git commit -m "chore: bump plugin version" -- .claude-plugin/plugin.json .claude-plugin/marketplace.json && \
  if [ -n "$SSH_KEY" ] && [ "$SSH_KEY" != "unset" ]; then
    GIT_SSH_COMMAND="ssh -i '$SSH_KEY'" git push origin <base-branch>
  else
    git push origin <base-branch>
  fi
fi
```

to:

```bash
if [[ "$BUMP_OUTPUT" == BUMPED* ]]; then
  git add .claude-plugin/plugin.json .claude-plugin/marketplace.json && \
  git commit -m "chore: bump plugin version" -- .claude-plugin/plugin.json .claude-plugin/marketplace.json && \
  git push origin <base-branch>
fi
```

Then, directly below the code block (before the existing "If that push is rejected..." paragraph),
insert this new sentence as its own paragraph:

```markdown
This push always uses the environment's default git/SSH config now, never a configured `ssh_key`
preference. A repo whose default config can't reach the remote will have this push fail here —
loudly, per the rejection handling below — rather than silently succeeding through a preference
this hook no longer reads.
```

- [ ] **Step 3: Edit `03-history-update.md`**

Change:

```bash
if [[ "$UPDATE_OUTPUT" == APPENDED* ]]; then
  SSH_KEY=$(node --experimental-strip-types scripts/preferences.ts --key ssh_key --action get)
  git add .digismith/history.html && \
  git commit -m "docs(history): record shipped features" -- .digismith/history.html && \
  if [ -n "$SSH_KEY" ] && [ "$SSH_KEY" != "unset" ]; then
    GIT_SSH_COMMAND="ssh -i '$SSH_KEY'" git push origin <base-branch>
  else
    git push origin <base-branch>
  fi
fi
```

to:

```bash
if [[ "$UPDATE_OUTPUT" == APPENDED* ]]; then
  git add .digismith/history.html && \
  git commit -m "docs(history): record shipped features" -- .digismith/history.html && \
  git push origin <base-branch>
fi
```

Then, directly below the code block (before the existing "If that push is rejected..." paragraph),
insert the same new sentence as its own paragraph (identical wording to Step 2 — both hooks share
the same behavior change):

```markdown
This push always uses the environment's default git/SSH config now, never a configured `ssh_key`
preference. A repo whose default config can't reach the remote will have this push fail here —
loudly, per the rejection handling below — rather than silently succeeding through a preference
this hook no longer reads.
```

- [ ] **Step 4: Verify both edits**

Run: `grep -n "ssh_key\|SSH_KEY" .digismith/hooks/post-finish/01-version-bump.md .digismith/hooks/post-finish/03-history-update.md`

Expected: no output — neither file mentions `ssh_key` or `SSH_KEY` anywhere anymore.

Run: `grep -n "git push origin <base-branch>" .digismith/hooks/post-finish/01-version-bump.md .digismith/hooks/post-finish/03-history-update.md`

Expected: one match per file, each immediately preceded by its file's `git commit` line with no
`if`/`else` around it.

- [ ] **Step 5: Confirm no other ssh_key consumer was touched**

Run: `grep -rln "ssh_key" skills/finishing-a-development-branch/SKILL.md skills/bootstrap/SKILL.md skills/adopt/SKILL.md skills/preferences/SKILL.md MEMORY.md`

Expected: all five files still listed (still contain `ssh_key`, unchanged) — confirms this task
did not touch them. If `git diff` shows any of these five files modified, that's a plan violation;
revert that file.

- [ ] **Step 6: Commit**

```bash
git add .digismith/hooks/post-finish/01-version-bump.md .digismith/hooks/post-finish/03-history-update.md
git commit -m "fix(hooks): drop the classifier-blocked ssh_key read, push with default config"
```

---

### Task 3: Write the live test procedure doc for Jack

**Files:**
- Create: `.digismith/board/DGS-161—plugin-update-after-merge/test-procedure.md`

**Interfaces:**
- Consumes: nothing from Task 1 or 2.
- Produces: nothing another task reads — this is a standalone reference doc for Jack to follow manually later, outside this plan's own execution.

- [ ] **Step 1: Write the file**

Create `.digismith/board/DGS-161—plugin-update-after-merge/test-procedure.md` with this exact
content:

```markdown
# Live test: does /reload-plugins apply a plugin update without a restart?

Run this from the maestro, using this ticket's own worker pane (`dgs-161`) as the test subject —
not a throwaway pane (memory is tight on this VPS). This pane's session started before this
ticket's own merge bumps the plugin version, so it is a genuine stale-session test with no extra
process needed. Run it after this ticket has merged to `main` and hook 02 has successfully run
`claude plugin update digismith@jazurite`.

**Observable:** invoking any skill prints `Base directory for this skill:
<...>/cache/jazurite/digismith/<version>/skills/<name>` as the first line of that skill's output.
The version number in that path is a direct read of which cache directory this specific session
is actually loading from right now — not what is merely installed on disk.

## Steps

1. **Before.** Confirm `~/.claude/plugins/cache/jazurite/digismith/` has a version directory newer
   than what this pane loaded at its own session start. Then run:

   ```
   herdr --session DigiSmith agent prompt dgs-161 "Invoke any digismith skill (for example digismith:toolchain with a harmless read-only argument) and report only its first line."
   ```

   Read the pane's reply. The version number in `Base directory for this skill:
   .../digismith/<version>/skills/...` should be the *old* version. If it already shows the new
   version, this pane already picked it up some other way — stop, this is not a valid test
   subject.

2. **Reload.** Confirm the pane is idle (not mid-turn — a plugin change only applies once the
   current response finishes), then send:

   ```
   herdr --session DigiSmith agent prompt dgs-161 "/reload-plugins"
   ```

   Read whatever the pane prints in response.

3. **After.** Repeat the exact same prompt from step 1:

   ```
   herdr --session DigiSmith agent prompt dgs-161 "Invoke any digismith skill (for example digismith:toolchain with a harmless read-only argument) and report only its first line."
   ```

   Read the version number again.

4. **Pass / fail / inconclusive.**
   - **Pass** — the "after" version is the new version and the "before" version was the old one.
     `/reload-plugins` genuinely updates a live session without a restart.
   - **Fail** — the "after" version is unchanged. Try
     `herdr --session DigiSmith agent prompt dgs-161 "/reload-plugins --force"` once, then repeat
     step 3. Still unchanged → `/reload-plugins` does not apply a marketplace plugin version bump
     here; a restart (closing and reopening the agent) is the only path, same as before this
     ticket.
   - **Inconclusive** — either command's reply contains wording like "not available over a remote
     connection" or similar refusal text. Record the exact wording — it would mean herdr's own
     pane is treated as a remote connection by the CLI, which changes the assumption that only the
     Desktop maestro is affected.

5. **Report back** (pass/fail/inconclusive, plus the exact wording of anything unusual) so hook
   02's reminder text (`.digismith/hooks/post-finish/02-plugin-reinstall.md`) can be tightened
   from "try, and restart if stale" to a confirmed statement either way, in a follow-up change.
```

- [ ] **Step 2: Verify**

Run: `cat ".digismith/board/DGS-161—plugin-update-after-merge/test-procedure.md"`

Expected: file exists, matches Step 1's content exactly.

- [ ] **Step 3: Commit**

```bash
git add ".digismith/board/DGS-161—plugin-update-after-merge/test-procedure.md"
git commit -m "docs(dgs-161): add the /reload-plugins live test procedure"
```
