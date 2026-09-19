# Per-Repo SSH Key Preference (H.2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a repo remember which SSH key file DigiSmith should use for its own `git` network commands (push/pull) in that repo, asked once at bootstrap/adopt and reused automatically afterward, with zero writes to `~/.gitconfig` or `~/.ssh/config`.

**Architecture:** One new preference key, `ssh_key`, stored through H's existing `digismith:preferences` skill — no new store, no new skill. A new **Step 0.6** in `digismith:bootstrap` (mirrored by a one-line addition to `digismith:adopt`'s own Step 2) asks for it once per repo, at the same moment `.digismith/profile` is resolved. Every network `git` command DigiSmith itself runs afterward — in `finishing-a-development-branch`'s Option 1/2, and in the two `post-finish` hooks that push on DigiSmith's own behalf — resolves this preference first and scopes the key to that one command via `GIT_SSH_COMMAND`, never touching any persistent config file.

**Tech Stack:** Skill prose only (Markdown). No new code, no new tests — reuses `digismith:preferences`' already-tested `get`/`set` operations exactly as they exist today.

## Global Constraints

- **Map item:** H.2 (tentative letter), extends H (Preferences store). Depends on nothing new — reuses H's existing `.digismith/preferences.yml` / `digismith:preferences` skill exactly as shipped, no changes to that skill itself.
- **Design doc:** `.digismith/docs/git-ssh-key-preference/design.html` — this plan implements it in full.
- **Storage:** exactly one new key, `ssh_key`, value the absolute path to an SSH private key file — no new file, no schema change to H's own store, no named/reusable identity registry (explicitly declined in the design), no per-subfolder granularity (per-repo-root only, same grain as `finish_option`).
- **No git/SSH config writes, ever.** Never touch `~/.gitconfig`, `~/.ssh/config`, or any file outside the repo's own `.digismith/preferences.yml`. Every use of the stored key is scoped to a single command invocation via `GIT_SSH_COMMAND="ssh -i <ssh_key>" <command>` — never a persistent `core.sshCommand` write, never an `includeIf` block.
- **`gh` CLI is fully out of scope.** No handling, no documented table, nothing — the design explicitly excludes it per Jack's own call.
- **Trigger timing:** checked once per repo, at the same moment `digismith:bootstrap`/`digismith:adopt` resolve `.digismith/profile` (both call `digismith:bootstrap`'s own Step 0/Step 0.5 today) — a new **Step 0.6**, not folded into Step 0 itself (keeps Step 0 from growing further, matches the project's own precedent of inserting non-integer sub-steps for insertions rather than renumbering, e.g. H.1's Step 3.5/4.5).
- **Consuming code always goes through `digismith:preferences` by name** wherever the caller could be running in an arbitrary consumer repo (`digismith:bootstrap`, `digismith:adopt`, `finishing-a-development-branch`) — never a bare relative path to `scripts/preferences.ts`, per that skill's own established constraint. The two `post-finish` hooks are the one exception: both are already gated to "DigiSmith's own repo only" before anything else runs, so a bare relative path to `scripts/preferences.ts` is valid there, matching the existing bare-relative-path invocation of `.digismith/hooks/post-finish/scripts/bump-plugin-version.ts` in the same files.
- **Testing convention:** this is skill prose with no automated test harness, same as H.1 and every other divergence in these files — verification is a careful manual read-through plus a real end-to-end run.

---

## File Structure

- `skills/bootstrap/SKILL.md` — **modified.** New `### Step 0.6: Resolve SSH Key Preference`, inserted between the existing Step 0.5 (ends at the `ticket: false` Jira-credential-skip line) and Step 1 (`### Step 1: Get a Real Ticket`). New Quick Reference row for `0.6`.
- `skills/adopt/SKILL.md` — **modified.** Step 2's existing "Run `digismith:bootstrap`'s Step 0.5 exactly" paragraph gains one more sentence: also run Step 0.6. Quick Reference row for Step 2 updated to match.
- `skills/finishing-a-development-branch/SKILL.md` — **modified.** Option 1's `git pull` and `git push origin <base-branch>`, and Option 2's `git push -u origin <feature-branch>`, each gain a preceding preference-resolution paragraph and an `${SSH_KEY_PREFIX}` substitution placeholder.
- `.digismith/hooks/post-finish/01-version-bump.md` — **modified.** Its own `git push origin <base-branch>` gains the same treatment, resolved via a direct (bare-relative-path) `scripts/preferences.ts` call since this hook is already gated to DigiSmith's own repo.
- `.digismith/hooks/post-finish/03-history-update.md` — **modified.** Same treatment as `01-version-bump.md`, same reasoning.

---

### Task 1: Resolve and store the SSH key preference (bootstrap/adopt)

**Files:**
- Modify: `skills/bootstrap/SKILL.md`
- Modify: `skills/adopt/SKILL.md`

**Interfaces:**
- Consumes: `digismith:preferences`' `get`/`set` operations for key `ssh_key` — invoked by name, never a bare relative path (both callers may run in an arbitrary consumer repo).
- Produces: the `ssh_key` preference itself, which Task 2's git commands read via the same `digismith:preferences`' `get` operation. Task 2 depends on this task's naming of the key (`ssh_key`) being exact.

- [ ] **Step 1: Insert Step 0.6 into `skills/bootstrap/SKILL.md`, immediately after Step 0.5 ends and immediately before `### Step 1: Get a Real Ticket`**

Step 0.5 currently ends with this paragraph (locate it to find the exact insertion point):

```markdown
If the active profile's `ticket` field is `false`, skip this credential
check entirely — continue straight to Step 1.
```

Insert the new step directly after that paragraph:

```markdown
### Step 0.6: Resolve SSH Key Preference

**Only runs when Step 0 falls through to actual ticket work** — same guard
Step 0.5 already applies. If the user's request was a standalone profile
switch and Step 0 already stopped there, skip this step entirely, same as
if it didn't exist.

Otherwise, check whether this repo already has a saved SSH key preference:
invoke `digismith:preferences`' `get` operation for key `ssh_key` (that
skill owns its own repo-resolution and invocation details — this step
never duplicates them).

**Returns a value other than `unset`** → a preference already exists.
Nothing to do — continue to Step 1.

**Returns `unset`** → first use in this repo. Ask once, plainly:

> "Which SSH key file should I use on this computer for this repo?"

Store the answer verbatim via `digismith:preferences`' `set` operation for
key `ssh_key`. If the user declines to answer, don't block ticket
creation over it — note plainly that DigiSmith's own `git` commands in
this repo will run with no explicit key override until this is set, and
continue to Step 1 regardless (mirrors Step 0.5's own non-blocking
disposition for a declined Jira credential prompt).

This preference is never written to `~/.gitconfig` or `~/.ssh/config` —
it lives only in this repo's own `.digismith/preferences.yml`, exactly
where H's existing worktree-propagation copy step (sub-step 8 of Step 2)
already carries it into every future worktree with no new code needed
here.
```

- [ ] **Step 2: Add a Quick Reference row for Step 0.6 in `skills/bootstrap/SKILL.md`**

Locate the existing Quick Reference table's `0.5` row and insert a new
`0.6` row immediately after it:

```markdown
| 0.6 | Skipped under the same condition as 0.5. Otherwise, check `digismith:preferences` for a saved `ssh_key`; if unset, ask once which SSH key file to use for this repo and store the answer via `set` — never written to `~/.gitconfig`/`~/.ssh/config`, only to `.digismith/preferences.yml` |
```

- [ ] **Step 3: Update `skills/adopt/SKILL.md`'s Step 2 to also run bootstrap's Step 0.6**

Find this existing sentence in Step 2:

```markdown
Then run `digismith:bootstrap`'s Step 0.5 exactly — invoke
`digismith:depot`'s `ensure` operation, then, if `ticket: true`, check
Jira credentials the same way. Same failure disposition: if `ensure`
fails, stop here entirely, report the error, do not proceed to Step 3.
A declined credential prompt does not stop the flow — same non-blocking
disposition `digismith:bootstrap` Step 0.5 documents — continue to Step
3 regardless.
```

Append one more sentence directly after it (same paragraph or a new one,
whichever reads more naturally against the surrounding text):

```markdown
Then run `digismith:bootstrap`'s Step 0.6 exactly — check for a saved
`ssh_key` preference via `digismith:preferences`, asking once if unset. A
declined answer does not stop the flow either, same non-blocking
disposition.
```

- [ ] **Step 4: Update `skills/adopt/SKILL.md`'s Quick Reference row for Step 2**

Change the existing Step 2 row from:

```
| 2 | Resolve profile and ensure the DigiSmith runtime clone — run `digismith:bootstrap` Step 0, then Step 0.5, exactly (including its `ticket: true` Jira credential check) |
```

to:

```
| 2 | Resolve profile and ensure the DigiSmith runtime clone — run `digismith:bootstrap` Step 0, then Step 0.5 (including its `ticket: true` Jira credential check), then Step 0.6 (SSH key preference), exactly |
```

- [ ] **Step 5: Self-check — read both files end to end**

Confirm: Step 0.6's "only runs when Step 0 falls through to actual ticket
work" guard reads consistently with Step 0.5's identical guard just above
it; the new Quick Reference rows don't disturb any existing row; every
existing step number in both files (0, 0.5, 1, 1.5, 2, 3 in bootstrap;
1 through 7 in adopt) is unchanged; adopt's new sentence reads naturally
against its surrounding paragraph. No automated check exists for this —
this read-through is the verification, per this plan's Global Constraints.

- [ ] **Step 6: Commit**

```bash
git add skills/bootstrap/SKILL.md skills/adopt/SKILL.md
git commit -m "feat(bootstrap): add SSH key preference check (H.2)"
```

---

### Task 2: Consume the preference in every network git command DigiSmith runs

**Files:**
- Modify: `skills/finishing-a-development-branch/SKILL.md`
- Modify: `.digismith/hooks/post-finish/01-version-bump.md`
- Modify: `.digismith/hooks/post-finish/03-history-update.md`

**Interfaces:**
- Consumes: `digismith:preferences`' `get` operation for key `ssh_key` (from `finishing-a-development-branch`, invoked by name since it may run in any consumer repo) and the bare-relative-path `scripts/preferences.ts` CLI directly (from the two hooks, since both are already gated to DigiSmith's own repo before this code runs).
- Produces: nothing another task consumes — this is the plan's other, independent behavioral change (Task 1 and Task 2 touch entirely different files and can be reviewed independently).

- [ ] **Step 1: Wrap Option 1's `git pull` and `git push` in `skills/finishing-a-development-branch/SKILL.md`**

Find the start of `### Option 1: Merge Locally`'s first bash block:

```markdown
```bash
# Get main repo root for CWD safety
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"

# Merge first — verify success before removing anything
git checkout <base-branch>
git pull
PRE_MERGE=$(git rev-parse HEAD)
git merge <feature-branch>
```
```

Immediately before this bash block, insert:

```markdown
Resolve this repo's `ssh_key` preference once, before running any command
below: invoke `digismith:preferences`' `get` operation for key `ssh_key`.
**Unset** → `SSH_KEY_PREFIX` is empty for the rest of this option. **Set**
→ `SSH_KEY_PREFIX` is `GIT_SSH_COMMAND="ssh -i <ssh_key>" ` (note the
trailing space) — substitute it literally in front of every command below
that's shown prefixed with `${SSH_KEY_PREFIX}`. This never writes to
`~/.gitconfig` or `~/.ssh/config` — the override applies only to each
individual command it's prefixed onto.
```

Then change the `git pull` line inside that same bash block from:

```
git pull
```

to:

```
${SSH_KEY_PREFIX}git pull
```

Next, find the push line further down in the same Option 1 section:

```
git push origin <base-branch>
```

Change it to:

```
${SSH_KEY_PREFIX}git push origin <base-branch>
```

Leave every other line in Option 1's bash blocks (the merge-range pin
`git update-ref` calls, `git checkout`, `git merge`, `<test command>`,
`git branch -d`) completely unchanged — none of them touch the network.

- [ ] **Step 2: Wrap Option 2's `git push` in the same file**

Find `### Option 2: Push and Create PR`'s bash block:

```markdown
```bash
git push -u origin <feature-branch>
# From a detached HEAD, name the new branch on the remote:
# git push origin HEAD:refs/heads/<new-branch>
```
```

Immediately before this bash block, insert the same resolution paragraph
Step 1 added for Option 1 (repeated here since Option 1/Option 2 are
independent, mutually-exclusive branches — a reader following just Option
2 needs this without having read Option 1 first):

```markdown
Resolve this repo's `ssh_key` preference once, before running the command
below: invoke `digismith:preferences`' `get` operation for key `ssh_key`.
**Unset** → `SSH_KEY_PREFIX` is empty. **Set** → `SSH_KEY_PREFIX` is
`GIT_SSH_COMMAND="ssh -i <ssh_key>" ` (note the trailing space) —
substitute it literally in front of the command below. This never writes
to `~/.gitconfig` or `~/.ssh/config` — the override applies only to this
one command.
```

Then change both lines inside that bash block from:

```
git push -u origin <feature-branch>
# From a detached HEAD, name the new branch on the remote:
# git push origin HEAD:refs/heads/<new-branch>
```

to:

```
${SSH_KEY_PREFIX}git push -u origin <feature-branch>
# From a detached HEAD, name the new branch on the remote:
# ${SSH_KEY_PREFIX}git push origin HEAD:refs/heads/<new-branch>
```

- [ ] **Step 3: Wrap the push in `.digismith/hooks/post-finish/01-version-bump.md`**

This hook is already gated to DigiSmith's own repo only (its first bash
block checks `IS_DIGISMITH` and stops if not true) — cwd is guaranteed to
be DigiSmith's own repo by the time this code runs, so a bare relative
path to `scripts/preferences.ts` is valid here (matching this same file's
existing bare-relative-path call to `scripts/bump-plugin-version.ts`
three lines below it).

Find this block:

```markdown
```bash
cd "$(git rev-parse --show-toplevel)"
PIN="refs/digismith/post-finish/<feature-branch>"
BASE_SHA=$(git rev-parse --verify --quiet "$PIN/base") || { echo "MISSING PIN $PIN/base — this hook reads the merge range finishing-a-development-branch Option 1 pins right after git merge; fire it from there, or pin by hand first (fire-lifecycle-hook.md, \"Merge-range pins\"). Stopping." >&2; exit 1; }
HEAD_SHA=$(git rev-parse --verify --quiet "$PIN/head") || { echo "MISSING PIN $PIN/head — the base pin exists but the head pin does not; pin by hand first (fire-lifecycle-hook.md, \"Merge-range pins\"). Stopping." >&2; exit 1; }
BUMP_OUTPUT=$(node --experimental-strip-types .digismith/hooks/post-finish/scripts/bump-plugin-version.ts --base "$BASE_SHA" --head "$HEAD_SHA")
BUMP_STATUS=$?
echo "$BUMP_OUTPUT"
if [ "$BUMP_STATUS" -ne 0 ]; then
  echo "Version bump script failed — stop here, do not push, and do not continue to any further post-finish hook. Investigate." >&2
fi
if [[ "$BUMP_OUTPUT" == BUMPED* ]]; then
  git add .claude-plugin/plugin.json .claude-plugin/marketplace.json && \
  git commit -m "chore: bump plugin version" -- .claude-plugin/plugin.json .claude-plugin/marketplace.json && \
  git push origin <base-branch>
fi
```
```

Replace the final `if [[ "$BUMP_OUTPUT" == BUMPED* ]]; then ... fi` block
with:

```bash
if [[ "$BUMP_OUTPUT" == BUMPED* ]]; then
  SSH_KEY=$(node --experimental-strip-types scripts/preferences.ts --key ssh_key --action get)
  git add .claude-plugin/plugin.json .claude-plugin/marketplace.json && \
  git commit -m "chore: bump plugin version" -- .claude-plugin/plugin.json .claude-plugin/marketplace.json && \
  if [ "$SSH_KEY" != "unset" ]; then
    GIT_SSH_COMMAND="ssh -i $SSH_KEY" git push origin <base-branch>
  else
    git push origin <base-branch>
  fi
fi
```

- [ ] **Step 4: Wrap the push in `.digismith/hooks/post-finish/03-history-update.md`, the same way**

Find this block:

```markdown
```bash
cd "$(git rev-parse --show-toplevel)"
PIN="refs/digismith/post-finish/<feature-branch>"
BASE_SHA=$(git rev-parse --verify --quiet "$PIN/base") || { echo "MISSING PIN $PIN/base — this hook reads the merge range finishing-a-development-branch Option 1 pins right after git merge; fire it from there, or pin by hand first (fire-lifecycle-hook.md, \"Merge-range pins\"). Stopping." >&2; exit 1; }
HEAD_SHA=$(git rev-parse --verify --quiet "$PIN/head") || { echo "MISSING PIN $PIN/head — the base pin exists but the head pin does not; pin by hand first (fire-lifecycle-hook.md, \"Merge-range pins\"). Stopping." >&2; exit 1; }
UPDATE_OUTPUT=$(node --experimental-strip-types .digismith/hooks/post-finish/scripts/update-history.ts --base "$BASE_SHA" --head "$HEAD_SHA")
UPDATE_STATUS=$?
echo "$UPDATE_OUTPUT"
if [ "$UPDATE_STATUS" -ne 0 ]; then
  echo "History update script failed — stop here, do not commit, and investigate." >&2
fi
if [[ "$UPDATE_OUTPUT" == APPENDED* ]]; then
  git add .digismith/history.html && \
  git commit -m "docs(history): record shipped features" -- .digismith/history.html && \
  git push origin <base-branch>
fi
```
```

Replace the final `if [[ "$UPDATE_OUTPUT" == APPENDED* ]]; then ... fi`
block with:

```bash
if [[ "$UPDATE_OUTPUT" == APPENDED* ]]; then
  SSH_KEY=$(node --experimental-strip-types scripts/preferences.ts --key ssh_key --action get)
  git add .digismith/history.html && \
  git commit -m "docs(history): record shipped features" -- .digismith/history.html && \
  if [ "$SSH_KEY" != "unset" ]; then
    GIT_SSH_COMMAND="ssh -i $SSH_KEY" git push origin <base-branch>
  else
    git push origin <base-branch>
  fi
fi
```

- [ ] **Step 5: Self-check — read all three files end to end**

Confirm: every other line in `finishing-a-development-branch`'s Option 1
bash blocks (merge-range pin `git update-ref` calls, `git checkout`,
`git merge`, `<test command>`, the reset-on-retry block, `git branch -d`)
is untouched; Option 3 and the discard path are untouched; both hooks'
`IS_DIGISMITH` gate, pin-reading logic, and their own bump/history-update
script calls are untouched — only the final push line in each changed;
the `${SSH_KEY_PREFIX}` substitution reads consistently between Option 1
and Option 2 (same variable name, same resolution wording); no
`~/.gitconfig` or `~/.ssh/config` write appears anywhere in any of the
three files. No automated check exists for this — this read-through is
the verification.

- [ ] **Step 6: Commit**

```bash
git add skills/finishing-a-development-branch/SKILL.md .digismith/hooks/post-finish/01-version-bump.md .digismith/hooks/post-finish/03-history-update.md
git commit -m "feat(finishing-a-development-branch): scope git push/pull to the saved SSH key preference (H.2)"
```

---

## Self-Review

**Spec coverage** (against `.digismith/docs/git-ssh-key-preference/design.html`):
- Problem — motivation only, no task needed.
- Storage — Task 1 Step 1 (the `ssh_key` key, via `digismith:preferences`, no new store).
- Trigger: bootstrap/adopt — Task 1 (Steps 1-4: Step 0.6 in bootstrap, the adopt cross-reference).
- Usage: scoped per-invocation, no persistent config writes — Task 2 (all four call sites, `GIT_SSH_COMMAND` scoped to one command each, explicit "never writes to `~/.gitconfig`/`~/.ssh/config`" stated at every insertion point).
- Error Handling (unset → no override; declined prompt → non-blocking; malformed preferences.yml → already covered by `digismith:preferences`' own contract) — Task 1 Step 1's non-blocking disposition; the "stored key doesn't exist on this machine" case from the design is deliberately left to `git`'s own natural failure (attempting `ssh -i <path>` against a missing file fails with a clear OpenSSH error) rather than a redundant pre-check DigiSmith would have to duplicate — consistent with YAGNI, and no task needed beyond what Task 2 already does.
- Out of Scope (`gh` CLI, git/SSH config writes, named registry, per-subfolder granularity) — nothing here builds any of these; verified absent from both tasks.

**Placeholder scan:** no `TBD`/`TODO`/"add appropriate error handling" anywhere above; every step shows the exact Markdown/bash to insert, with real before/after text.

**Type consistency:** the preference key `ssh_key` is spelled identically everywhere it appears — Task 1's Step 0.6 (`get`/`set` for key `ssh_key`), Task 2's `finishing-a-development-branch` resolution paragraphs (`get` operation for key `ssh_key`), and both hooks' direct CLI calls (`--key ssh_key --action get`). The `${SSH_KEY_PREFIX}` variable name and its exact value (`GIT_SSH_COMMAND="ssh -i <ssh_key>" ` with a trailing space, or empty) are identical between Option 1 and Option 2 in Task 2. The hooks' own `$SSH_KEY` shell variable (holding the raw resolved value, `unset` or a path) is distinct from `${SSH_KEY_PREFIX}` (the fully-formed command prefix) — the two files use different resolution shapes deliberately (real bash vs. agent-invoked skill), matching the Global Constraints' bare-relative-path exception for hooks only.
