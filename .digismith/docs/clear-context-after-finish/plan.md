# Clear Context After Finish (H.3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new Step 7 to `finishing-a-development-branch` that offers to clear the running session's context after Option 1 or Option 2 completes, backed by a new per-repo `clear_context` preference — map item H.3.

**Architecture:** Single-file prose addition to `skills/finishing-a-development-branch/SKILL.md`: a new `## Step 7: Offer to Clear Context` section mirroring Step 3.5/4.5's existing ask/remember/override shape, plus small cross-reference pointers at the tail of Option 1 and Option 2, plus a Quick Reference note. No new scripts or code — reuses the existing `digismith:preferences` skill and the existing `mcp__ccd_session_mgmt__clear_session` tool.

**Tech Stack:** Markdown prose only. No test harness applies (SKILL.md files aren't covered by `pnpm test`).

## Global Constraints

- Full spec: `.digismith/docs/clear-context-after-finish/design.html` — read it if anything below is ambiguous.
- Step 7 applies only after Option 1 (Merge Locally) and Option 2 (Push and Create PR) — never after Option 3 (Keep As-Is).
- Preference key: `clear_context`, values `yes`/`no`, read/written via `digismith:preferences`' `get`/`set` operations — no new storage mechanism.
- An explicit override in the human partner's own message for a specific run changes only that run — it never silently overwrites the saved preference. Only an explicit "remember this?"/"always" answer writes the preference.
- The unresolved-thread warning (if one applies) and the complete final summary must both be said **before** invoking `mcp__ccd_session_mgmt__clear_session` — nothing said after that tool call is preserved into the next context.
- This is DigiSmith's own self-development. Per standing preference, this work happens in an isolated worktree — never directly on `main`.
- No automated test harness covers `SKILL.md` prose — verification is a careful read-through, not a test run.

---

### Task 1: Add Step 7 to `finishing-a-development-branch`

**Files:**
- Modify: `skills/finishing-a-development-branch/SKILL.md` (new `## Step 7` section, two small cross-reference insertions at the tail of Option 1 and Option 2, one Quick Reference addition, two Common Rationalizations rows)

**Interfaces:**
- Consumes: `digismith:preferences`' `get`/`set` operations (key `clear_context`, values `yes`/`no`) — already shipped, no changes needed there. `mcp__ccd_session_mgmt__clear_session` (tool, `session_id: "self"`) — already available, no changes needed there.
- Produces: None — pure prose, no new interfaces for later tasks (this is the plan's only task).

- [ ] **Step 1: Confirm the four exact anchor points are unchanged**

Run: `grep -n "^### Option 2: Push and Create PR$\|^### Option 3: Keep As-Is$\|^## Quick Reference$\|^## Common Rationalizations$" skills/finishing-a-development-branch/SKILL.md`

Expected output (line numbers may differ slightly from this plan's own drafting pass — that's fine, just confirm all four headings exist verbatim; if any is missing or reworded, stop and report rather than guessing at a fuzzy edit):

```
### Option 2: Push and Create PR
### Option 3: Keep As-Is
## Quick Reference
## Common Rationalizations
```

- [ ] **Step 2: Insert the Option 1 → Step 7 cross-reference**

In `skills/finishing-a-development-branch/SKILL.md`, find this exact substring:

```
Once every hook has fired, delete the pins:

```bash
git update-ref -d refs/digismith/post-finish/<feature-branch>/base
git update-ref -d refs/digismith/post-finish/<feature-branch>/head
```

### Option 2: Push and Create PR
```

Replace it with:

```
Once every hook has fired, delete the pins:

```bash
git update-ref -d refs/digismith/post-finish/<feature-branch>/base
git update-ref -d refs/digismith/post-finish/<feature-branch>/head
```

Once cleanup (Step 6) is done, continue to Step 7 to offer clearing this session's context.

### Option 2: Push and Create PR
```

- [ ] **Step 3: Insert the Option 2 → Step 7 cross-reference**

Find this exact substring:

```
Keep the worktree — your human partner iterates on PR feedback there.

Once the PR is created and its URL reported, offer one lightweight
follow-up: *"Draft a Teams review-request message for this PR?"*
**Yes** → invoke `digismith:teams-pr-review-notification`, passing this
PR's title, URL, and the current ticket key if the branch name matched
`<Key>__<slug>`. **No** → say nothing further, proceed normally. Never
invoke it unasked — this is an offer, not an automatic action, the same
disposition Step 4.5's "remember this?" follow-up already has for a
different case.

### Option 3: Keep As-Is
```

Replace it with:

```
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
```

- [ ] **Step 4: Insert the new Step 7 section and the Quick Reference note**

Find this exact substring:

```
**Otherwise:** The host environment owns this workspace — leave it in
place. If your platform provides a workspace-exit tool, use it.

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

## Common Rationalizations
```

Replace it with:

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

Before actually clearing (whichever path led here), scan the conversation for any unresolved
thread unrelated to the feature just shipped — a pending question, a task mentioned but not
started, something asked to be revisited later. If one exists, name it plainly as part of the
final message: "Note: before I clear this session's context, you still have `<X>` open from
earlier — nothing's tracking that after this clears, so make a note if you want to come back to
it." This is a verbal warning only — never write it to a file or a memory entry. If nothing
unresolved is found, skip this silently.

To actually clear: say the complete final summary first — what shipped, what's next, the
unresolved-thread warning if one applies — then, as the last action of the turn, invoke
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
```

- [ ] **Step 5: Add two Common Rationalizations rows**

Find this exact substring (the table's header and its first row):

```
## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Tests passed earlier this session" | Run the suite on the tree you are about to integrate. A green run only proves the tree it ran on. |
```

Replace it with:

```
## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "The feature's done, they'd obviously want a fresh start" | Ask first, same as every other Step 7 decision — a saved `yes` preference is what skips the ask, never an inferred assumption. |
| "I'll clear now and mention what's next after" | The clear takes effect once this turn ends — anything said after the tool call in a later turn never happened as far as the next context is concerned. Say the full summary first, clear last. |
| "Tests passed earlier this session" | Run the suite on the tree you are about to integrate. A green run only proves the tree it ran on. |
```

- [ ] **Step 6: Read the whole file once, end to end**

Open `skills/finishing-a-development-branch/SKILL.md` and read it top to bottom. Confirm: Step 7 reads clearly in its new position, right after Step 6 and before Quick Reference; both cross-reference sentences (Option 1's and Option 2's) read naturally in context; the two new Common Rationalizations rows fit the table's existing style; every other section of the file (Steps 1 through 6, Options 1-3's own bodies, the discard path) is otherwise byte-for-byte unchanged; no stray blank lines or heading-level shifts were introduced around any of the four edits.

- [ ] **Step 7: Commit**

```bash
git add skills/finishing-a-development-branch/SKILL.md
git commit -m "feat(finishing-a-development-branch): offer to clear session context after finish (H.3)"
```
