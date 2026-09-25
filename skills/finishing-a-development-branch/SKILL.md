---
name: finishing-a-development-branch
description: Use when implementation is complete, all tests pass, and you need to decide how to integrate the work (DigiSmith fork of Superpowers' finishing-a-development-branch)
---

# Finishing a Development Branch

## Overview

**Core principle:** Verify tests → Detect environment → Present options → Execute choice → Clean up.

**Announce at start:** "I'm using the finishing-a-development-branch skill to complete this work."

## Step 1: Verify Tests

Run the project's full test suite (`npm test` / `cargo test` / `pytest` / `go test ./...`).

**If tests fail**, report the failures and stop — the menu comes after a green suite:

```
Tests failing (<N> failures). Must fix before completing:

[Show failures]
```

**If tests pass:** continue to Step 2.

## Step 2: Detect Environment

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
# Capture now, while still inside the workspace — Step 5 changes directory
# before cleanup (Step 6) needs this value
WORKTREE_PATH=$(git rev-parse --show-toplevel)
```

This determines which menu to show and how cleanup works:

| State | Menu | Cleanup |
|-------|------|---------|
| `GIT_DIR == GIT_COMMON` (normal repo) | Standard 3 options | No worktree to clean up |
| `GIT_DIR != GIT_COMMON`, named branch | Standard 3 options | Provenance-based (see Step 6) |
| `GIT_DIR != GIT_COMMON`, detached HEAD | Reduced 2 options (no merge) | Externally managed — leave in place |

## Step 3: Determine Base Branch

The base branch is whatever this work forked from — usually named in the
plan, the conversation, or the branch's upstream. If it is not already
known, ask: "This branch split from <your best guess> - is that correct?"
Confirm before merging: merging into the wrong base is expensive to undo.

## Step 3.5: Check for a Saved Finish Option

Before presenting Step 4's menu, check whether this repo already has a saved
default: invoke `digismith:preferences`' `get` operation for key
`finish_option` (that skill owns its own repo-resolution and invocation
details — this step never duplicates them).

**Only applies to the normal-repo / named-branch-worktree menu** (Step 2's
"Standard 3 options" row). The detached-HEAD 2-option menu never has a saved
default to check — skip this step entirely in that case and go straight to
Step 4's detached-HEAD menu.

**Returns `unset` — or any value other than `merge_locally`/`pr`** → no
saved default. Continue to Step 4 exactly as written, unchanged.

**Returns `merge_locally` or `pr`** → a saved default exists for this repo.
Check the human partner's own message for *this specific run* for either of
two distinct signals before doing anything else:

- **An explicit one-off override** — e.g. "push this as a PR instead," "merge
  this one locally this time." Changes only this run; the saved value is
  never touched.
- **An explicit permanent-change instruction** — e.g. "always PR this repo
  from now on," "stop merging locally here, always PR." Different from a
  one-off override: it applies this run's choice **and** overwrites the
  saved value, via `digismith:preferences`' `set` operation for key
  `finish_option` with the new value. Never infer this from a single
  override alone — it requires an explicit "from now on"/"always" framing,
  the same restraint `writing-plans`' Execution Handoff already applies to
  reading "the user's original request was also to start work" rather than
  guessing at intent.

Then:

- **User explicitly asks to see the menu** ("show the menu", "ask me
  again") → proceed to Step 4 exactly as written, as if no saved default
  existed. This does not clear the saved value — only a "remember
  this?"/"always" answer does that (Step 4.5, or the permanent-change branch
  above).
- **No override, no permanent-change instruction, no request to see the
  menu** → skip Step 4's menu entirely. Announce the saved default plainly:
  *"Using saved default for this repo: `<merge locally|Push+PR>`. Say 'show
  the menu' to override once."* Then act exactly as if that option had just
  been chosen at Step 4 — proceed straight to Step 5's matching option. Step
  4.5's follow-up never fires here — it exists only for a fresh answer at
  Step 4, not a reused saved one.
- **A one-off override present** → skip Step 4's menu, proceed straight to
  Step 5 for the overriding option this run, saved value untouched.
- **A permanent-change instruction present** → write the new value (above),
  then proceed straight to Step 5 for that option this run.

## Step 4: Present Options

**Normal repo and named-branch worktree — present exactly these 3 options:**

```
Implementation complete. What would you like to do?

1. Merge back to <base-branch> locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)

Which option?
```

**Detached HEAD — present exactly these 2 options:**

```
Implementation complete. You're on a detached HEAD (externally managed workspace).

1. Push as new branch and create a Pull Request
2. Keep as-is (I'll handle it later)

Which option?
```

Present the menu exactly as written — concise, with every option coming
from the list above. Discarding the work happens only in response to your
human partner explicitly asking for it (see "If your human partner asks to
discard the work" below). Wait for their answer; the integration decision
is theirs.

## Step 4.5: Offer to Remember the Choice

**Only after a fresh Step 4 answer** — never after Step 3.5 skipped the menu
using an already-saved default (that path has its own disposition above,
with no follow-up).

After the human partner answers Step 4's menu with Option 1 or Option 2
(never Option 3 — see below), ask one lightweight follow-up before Step 5
executes:

> "Remember `<merge locally|Push+PR>` as this repo's default, so I stop
> asking?"

**If this fresh answer follows a "show the menu" request while a saved
default already existed** (Step 3.5's last bullet) → phrase the follow-up
as *"Change this repo's saved default to `<merge locally|Push+PR>`?"*
instead — a saved default already exists, so "so I stop asking" doesn't
fit; everything else about the Yes/No handling below stays identical.

**Yes** → write `finish_option` (`merge_locally` for Option 1, `pr` for
Option 2) via `digismith:preferences`' `set` operation.
**No** → proceed normally this run; nothing is written, so Step 3.5 asks
again next time.

**Option 3 (Keep as-is) never gets this follow-up** — it's a one-off
deferral, never a repeatable default, and is never itself a stored value.
Skip straight to Step 5 for Option 3.

Then continue to Step 5 exactly as written.

## Step 5: Execute Choice

### Option 1: Merge Locally

Resolve this repo's `ssh_key` preference once, before running any command
below: invoke `digismith:preferences`' `get` operation for key `ssh_key`.
**Unset** → `SSH_KEY_PREFIX` is empty for the rest of this option. **Set**
→ `SSH_KEY_PREFIX` is `GIT_SSH_COMMAND="ssh -i '<ssh_key>'" ` (note the
trailing space) — substitute it literally in front of every command below
that's shown prefixed with `${SSH_KEY_PREFIX}`. This never writes to
`~/.gitconfig` or `~/.ssh/config` — the override applies only to each
individual command it's prefixed onto.

```bash
# Get main repo root for CWD safety
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"

# Merge first — verify success before removing anything
git checkout <base-branch>
${SSH_KEY_PREFIX}git pull
PRE_MERGE=$(git rev-parse HEAD)
git merge <feature-branch>

# Pin this merge's range for the post-finish hooks (see fire-lifecycle-hook.md,
# "Merge-range pins") — only if the merge actually moved HEAD, so a conflicted
# or already-merged run never writes a wrong pin. Keyed by branch, so concurrent
# merges on a shared checkout never clobber each other's pins.
if [ "$(git rev-parse HEAD)" != "$PRE_MERGE" ]; then
  git update-ref refs/digismith/post-finish/<feature-branch>/base "$PRE_MERGE"
  git update-ref refs/digismith/post-finish/<feature-branch>/head HEAD
fi

# Verify tests on merged result
<test command>
```

If `git merge` stops on conflicts, nothing was pinned (`HEAD` did not move).
Resolve the conflicts and `git commit` the merge, then pin by hand before
running `<test command>` — the merge commit's first parent is the pre-merge
tip:

```bash
git update-ref refs/digismith/post-finish/<feature-branch>/base HEAD^1
git update-ref refs/digismith/post-finish/<feature-branch>/head HEAD
```

If `git merge` reports `Already up to date`, an earlier Option 1 run already
merged this branch and stopped partway (failed tests, a hook that failed
before the unpin step). Nothing was pinned just now, so that run's pins are
still in place and still correct — `git for-each-ref
refs/digismith/post-finish/<feature-branch>/` shows them. Continue from
wherever that run stopped. Never re-pin here: `ORIG_HEAD` now reflects the
`git pull` above, not this branch's merge.

If tests fail on the merged result: stop, leave the worktree and branch in
place, and investigate — nothing has been pushed, so the merge is local and
recoverable. The two pin refs stay in place; nothing reads them until a
`post-finish` hook for this branch fires. If the fix needs new commits on
`<feature-branch>`, undo the local merge first, so the re-run merges and pins
the full range in one go — but only while `HEAD` is still this merge's own
pinned `head`. If it is not, another session has since merged on top of your
unpushed merge: stop and ask instead of resetting.

```bash
[ "$(git rev-parse HEAD)" = "$(git rev-parse refs/digismith/post-finish/<feature-branch>/head)" ] && \
  git reset --hard refs/digismith/post-finish/<feature-branch>/base
```

Once the merged result is green, push `<base-branch>` to origin:

```bash
${SSH_KEY_PREFIX}git push origin <base-branch>
```

If the push is rejected (the remote moved since `git pull` above): stop,
report the rejection plainly, and investigate — do not force-push
automatically. Force-push only on your human partner's explicit request
(see "The push was rejected — force-push will fix it" below).

Once the push succeeds: clean up the worktree (Step 6), then delete the
branch:

```bash
git branch -d <feature-branch>
```

Finally, fire the `post-finish` lifecycle hook: see `fire-lifecycle-hook.md`
(in this skill's own folder) for the procedure. This runs in every repo,
DigiSmith's own included — a repo with no `.digismith/hooks/post-finish/`
folder simply has nothing to fire. Hooks that reason about "what did this
merge bring in" read the two pin refs written right after `git merge`
above — never `ORIG_HEAD` or the live `HEAD`, both of which another
session's merge on the same checkout may have moved by the time a hook
actually runs.

Once every hook has fired, delete the pins:

```bash
git update-ref -d refs/digismith/post-finish/<feature-branch>/base
git update-ref -d refs/digismith/post-finish/<feature-branch>/head
```

Once cleanup (Step 6) is done, continue to Step 7 to offer clearing this session's context.

### Option 2: Push and Create PR

Resolve this repo's `ssh_key` preference once, before running the command
below: invoke `digismith:preferences`' `get` operation for key `ssh_key`.
**Unset** → `SSH_KEY_PREFIX` is empty. **Set** → `SSH_KEY_PREFIX` is
`GIT_SSH_COMMAND="ssh -i '<ssh_key>'" ` (note the trailing space) —
substitute it literally in front of the command below. This never writes
to `~/.gitconfig` or `~/.ssh/config` — the override applies only to this
one command.

```bash
${SSH_KEY_PREFIX}git push -u origin <feature-branch>
# From a detached HEAD, name the new branch on the remote:
# ${SSH_KEY_PREFIX}git push origin HEAD:refs/heads/<new-branch>
```

**Draft the PR description before creating the request.** Resolve `<digismith-repo>` the same
two-step way `digismith:inject-standards` already establishes for `standards/` (current working
directory has `.claude-plugin/plugin.json` naming `digismith` → use it directly; otherwise ask for
DigiSmith's repo path this session and remember it). Read
`<digismith-repo>/standards/global/pr-descriptions.md` first — its shape (short, plain, no
templated headers/checklists) always governs, regardless of the check below. Then check
`technical_voice` for this repo (`node --experimental-strip-types <digismith-repo>/scripts/voice.ts --action status`).
**Reads `on`** (default, and also the disposition when the key is missing or malformed — same as
`scripts/voice.ts`'s own existing behavior) → additionally read
`<digismith-repo>/standards/global/ste100-writing.md` and its companions, and apply their
sentence-level rules only *within* the shape `pr-descriptions` already set — never adding structure
(headers, checklists, extra sections) that `pr-descriptions` forbids. **Reads `off`** → draft using
`pr-descriptions`' shape alone, with no `ste100-writing` sentence styling. **Any standard file is
missing or unreadable** → don't block PR creation; draft using whichever standard(s) are actually
available, and note plainly in your response that the missing one couldn't be applied this time.

Then create the pull/merge request against <base-branch> with the forge's
tooling — its CLI if one is available, or the creation URL most forges
print when you push — using the description just drafted. `pr-descriptions`
itself defers to a repo's own PR template file when one exists (e.g.
`.github/pull_request_template.md`) — follow that template's structure if
present; the prose-style standards above still govern whatever free text
you write within it. Report the URL to your human partner.

Keep the worktree — your human partner iterates on PR feedback there.

Once the PR is created and its URL reported, offer one lightweight
follow-up: *"Draft a Teams review-request message for this PR?"*
**Yes** → invoke `digismith:teams-pr-review-notification`, passing this
PR's title, URL, and the current ticket key if the branch name matched
`<Key>__<slug>`. **No** → say nothing further, proceed normally. Never
invoke it unasked — this is an offer, not an automatic action, the same
disposition Step 4.5's "remember this?" follow-up already has for a
different case.

Once the Teams-notification offer is resolved (either answer), continue to Step 7 to offer
clearing this session's context.

### Option 3: Keep As-Is

Report: "Keeping branch <name>. Worktree preserved at <path>."

### If your human partner asks to discard the work

This path exists only as a response to an explicit request to throw the
work away. Confirm first:

```
This will permanently delete:
- Branch <name>
- All commits: <commit-list>
- Worktree at <path>

Type 'discard' to confirm.
```

Wait for that exact confirmation. When it arrives:

```bash
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"
```

Then clean up the worktree (Step 6) and force-delete the branch:

```bash
git branch -D <feature-branch>
```

## Step 6: Cleanup Workspace

**Runs for Option 1 and confirmed discards.** Options 2 and 3 always
preserve the worktree. Both callers have already changed directory to the
main repo root — worktree removal must run from outside the worktree —
and use the `GIT_DIR`/`GIT_COMMON`/`WORKTREE_PATH` values captured in
Step 2, from before that directory change.

**If `GIT_DIR == GIT_COMMON`:** Normal repo, no worktree to clean up. Done.

**If `WORKTREE_PATH` is under `.worktrees/` or `worktrees/`:** Superpowers
created this worktree — we own cleanup:

```bash
git worktree remove "$WORKTREE_PATH"
git worktree prune  # Self-healing: clean up any stale registrations
```

**Otherwise:** The host environment owns this workspace — leave it in
place. If your platform provides a workspace-exit tool, use it.

## Step 7: Offer to Clear Context

**Runs after Option 1 or Option 2 only** — never after Option 3 (Keep As-Is), which is a
deliberate deferral, not completion, the same distinction Step 4.5 already draws for its own
follow-up.

Check this repo's saved default: invoke `digismith:preferences`' `get` operation for key
`clear_context`.

**Returns `unset`** → ask: "Clear this session's context now that the feature is done?" After
the human partner answers, ask one separate follow-up: "Remember this as your default for this
repo?" **Yes** → write `clear_context` (`yes` or `no`, matching the answer just given) via
`digismith:preferences`' `set` operation. **No** → proceed for this run only; ask again next
time.

**Returns `yes`** → check the human partner's own message for this specific run for an explicit
override ("don't clear", "keep going", "not this time"). **No override** → skip the ask,
announce: "Using saved default for this repo: clearing context now. Say 'don't clear' to
override once." then proceed to clear. **Override present** → skip clearing for this run only;
the saved value is untouched.

**Returns `no`** → check the human partner's own message for this specific run for an explicit
override ("clear context", "start fresh"). **No override** → skip silently, do not clear.
**Override present** → proceed to clear for this run only; the saved value is untouched.

Before actually clearing (whichever path led here), write a handoff file so the next session that
opens this repo doesn't start from nothing.

**Ensure `.digismith/sessions/` is ignored** (once per repo — every run after this finds it
already ignored and skips straight to writing the handoff file):

```bash
git check-ignore -q .digismith/sessions/ ; echo "exit=$?"
```

`exit=0` (already ignored) → skip straight to composing the handoff below. `exit=1` (not
ignored) → append a `.digismith/sessions/` line to this repo's local, per-repo
`.git/info/exclude` (resolve its path with `git rev-parse --git-path info/exclude`; create the
file if it doesn't exist):

```bash
echo ".digismith/sessions/" >> "$(git rev-parse --git-path info/exclude)"
```

This is local-only and never committed or pushed — `info/exclude` lives in the repository's
common git directory, shared automatically across the main checkout and every worktree of this
same repo, so this heal never touches `.gitignore`, never lands inside a just-opened PR (Option
2), and never depends on a push that could fail from a detached HEAD. A genuinely fresh clone on
another machine simply repeats this same one-time, idempotent check on its own first Step 7 run.

**Resolve this session's own id:** invoke `mcp__ccd_session_mgmt__get_session` with
`session_id: "self"` and read the returned `sessionId`. If the call fails or returns no usable
id, fall back to an ISO-8601 timestamp (`date -u +%Y%m%dT%H%M%SZ`) instead — the write must still
happen either way.

**Compose the handoff:** scan the conversation for any unresolved thread unrelated to the feature
just shipped — a pending question, a task mentioned but not started, something asked to be
revisited later — and fold it into the sections below. Write
`.digismith/sessions/<session-id-or-timestamp>.md`
with exactly these 5 sections, drawn from what this session already knows — never parsed from a
branch name, never inferred by a lookup:

```markdown
# <one-line title: what this session was doing>

## Where this fits

<Map item(s) or ticket key this session was working, links to the relevant design.html/plan.md,
the branch/worktree path.>

## Status per unit of work

<Explicit done/in-progress/not-started per item, cross-checked against any existing ledger or
progress file rather than restated from memory.>

## Exact resume point

<The next concrete action, named precisely enough that a cold session doesn't have to infer it.>

## Anything flagged but deliberately out of scope

<A spawned background task, a deferred backlog note, a bug found in passing — named with its own
tracking id/link. "None" if there's genuinely nothing.>

## Literal resume commands

<The actual `cd`/skill-invocation a session would run, not just a description.>
```

If the file write itself fails (disk, permissions), report it in the final summary but do not
block the clear on it — this is an orientation aid, not a gate.

To actually clear: say the complete final summary first — what shipped, what's next, and
`Handoff written to .digismith/sessions/<id>.md for the next session.` — then, as the last action
of the turn, invoke
`mcp__ccd_session_mgmt__clear_session` with `session_id: "self"`. The clear only takes effect
once this turn ends and the session goes idle, so nothing said before it is lost from the
conversation the human partner just read — only from what a future turn remembers. If the human
partner sends another message before the session goes idle, the tool itself silently drops the
queued clear; that is expected behavior, not a bug to work around.

## Quick Reference

| Option | Merge | Push | Keep Worktree | Cleanup Branch |
|--------|-------|------|---------------|----------------|
| 1. Merge locally | yes | yes | - | yes |
| 2. Create PR | - | yes | yes | - |
| 3. Keep as-is | - | - | yes | - |
| Discard (explicit request only) | - | - | - | yes (force) |

Steps 3.5/4.5 can skip this menu entirely when a `finish_option`
preference is already saved for the repo — see those steps for the full
logic.

Step 7 (after Options 1/2 only) can similarly skip its own ask when a
`clear_context` preference is already saved for the repo — see that step
for the full logic.

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "The feature's done, they'd obviously want a fresh start" | Ask first, same as every other Step 7 decision — a saved `yes` preference is what skips the ask, never an inferred assumption. |
| "I'll clear now and mention what's next after" | The clear takes effect once this turn ends — anything said after the tool call in a later turn never happened as far as the next context is concerned. Say the full summary first, clear last. |
| "Tests passed earlier this session" | Run the suite on the tree you are about to integrate. A green run only proves the tree it ran on. |
| "They obviously want it merged" | Integration is your human partner's decision. Present the menu and wait. |
| "They seem done with this feature — I'll offer to discard it" | The menu is complete as written. Discard happens only when your human partner asks for it in so many words. |
| "'Yeah, get rid of it' counts as confirmation" | Only the typed word `discard` authorizes deletion. |
| "The PR is up, so the worktree is clutter now" | PR feedback gets fixed in that worktree. It stays until the work lands. |
| "This other worktree looks stale — I'll clean it too" | Clean up only worktrees under `.worktrees/` or `worktrees/`. Everything else belongs to the host. |
| "The merged-result failure is probably flaky" | A failing merged result stops everything. Branch and worktree stay put while you investigate. |
| "The base branch is obviously main" | Confirm the fork point or ask. Merging into the wrong base is expensive to undo. |
| "The push was rejected — force-push will fix it" | A rejected push means the remote moved. Investigate; force-push only on your human partner's explicit request. |
| "A saved preference means I can skip the follow-up ask" | The first-run "remember this?" question (Step 4.5) is still required on every fresh menu answer — a saved preference is written only by explicit consent or an explicit "always" instruction, never inferred silently. |
| "The PR was just created, they'd obviously want a Teams message too" | Always ask first — this is an offer, never an automatic action. Declining is a normal outcome, not something to talk them out of. |
| "The merge was seconds ago — the hook can just read `ORIG_HEAD`" | Another session's merge on the same checkout moves `ORIG_HEAD` and `HEAD` without warning, and hooks get paused. Hooks read this merge's pin refs, nothing else. |
