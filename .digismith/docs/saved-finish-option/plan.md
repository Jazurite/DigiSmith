# Saved Finish Option (H.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `finishing-a-development-branch`'s Step 4 menu from asking the same Merge-locally-vs-PR question every single time a branch finishes, by letting a repo's answer persist via H's `.digismith/preferences.yml` store (through the `digismith:preferences` skill) and reusing it automatically on later runs, unless a specific run's own message overrides it.

**Architecture:** Two small insertions into `skills/finishing-a-development-branch/SKILL.md`, both non-integer sub-steps so no existing step number shifts: a new **Step 3.5** (right after Step 3's base-branch determination, right before Step 4's menu) that checks for a saved `finish_option` preference via `digismith:preferences` and either skips straight to Step 5 or falls through to Step 4 unchanged; and a new **Step 4.5** (right after Step 4's menu, right before Step 5 executes the choice) that offers the one-time "remember this?" follow-up on a *fresh* menu answer. Neither step touches `.digismith/preferences.yml` directly — both go through `digismith:preferences`' `get`/`set` operations, per H's own design ("a consuming skill never parses the YAML itself").

**Tech Stack:** Skill prose only (Markdown). No new code, no new tests — this diverges an existing vendored primitive the same way W.4/W.4.1 did, and carries the same verification method: careful read-through plus a real end-to-end run.

## Global Constraints

- **Map item:** H.1 (Saved Finish Option), depends on H (Preferences store, shipped). Renumbered 2026-09-06 from an original "W.8" working name because it extends H's own storage mechanism rather than being a `finishing-a-development-branch`-primitive-content activation in W's own lineage (see `MEMORY.md`'s **H** row) — even though the actual edit does land inside `skills/finishing-a-development-branch/SKILL.md`, a file W's lineage also edits; the map-letter distinction is about feature identity, not file ownership.
- **Design doc:** `.digismith/docs/preferences-and-finish-option/design.html`, sections `#h1-problem`, `#h1-behavior`, `#h1-scope` (H's own sections, `#h-*`, are already shipped — H.1 implements only its own three sections). The doc already uses "H.1" throughout (already renamed from "W.8" by an earlier session) — no rename work needed here.
- **Storage:** exactly one key, `finish_option`, values `merge_locally` or `pr` — no new keys, no new file, no schema change to H's own store. All reads/writes go through `digismith:preferences` (`get key=finish_option`, `set key=finish_option value=<merge_locally|pr>`) — never a raw file read/write, never a direct `scripts/preferences.ts` invocation from inside `finishing-a-development-branch`'s own prose (that belongs to `digismith:preferences` alone).
- **First run in a repo (no `finish_option` set):** Step 4's menu is presented exactly as it is today, unchanged. After the human partner answers with Option 1 or Option 2 (never Option 3), one lightweight follow-up: *"Remember `<option>` as this repo's default, so I stop asking?"* Yes → write `finish_option` via `digismith:preferences`. No → proceed normally this run; nothing written, asked again next time.
- **Subsequent runs (`finish_option` already set):** skip the menu. Announce the saved default plainly (e.g. *"Using saved default for this repo: merge locally. Say 'show the menu' to override once."*) and proceed straight to executing that option — **unless** the user's own message for this specific run already stated an explicit override (a one-off, saved value untouched) or an explicit *permanent* change ("always PR this repo from now on" — applies this run **and** overwrites the saved value). Never infer permanence from a single override.
- **Scope:** the normal-repo / named-branch-worktree three-option menu only. The detached-HEAD two-option menu (Push+PR / Keep as-is) is out of scope — only one option there is ever repeatable, nothing to remember or skip.
- **Applies uniformly:** no `IS_DIGISMITH`-based hardcoding anywhere in this change — DigiSmith's own repo goes through the exact same mechanism as any consumer repo.
- **Testing convention:** this is skill prose with no automated test harness, same as every other `finishing-a-development-branch` divergence (W.4, W.4.1) — verification is a careful manual read-through (Task 1's own self-check step) plus a real end-to-end run, which happens naturally the next time this very branch is finished (first-run path, since this repo's own `.digismith/preferences.yml` has no `finish_option` key yet).

---

## File Structure

- `skills/finishing-a-development-branch/SKILL.md` — **modified.** Gains Step 3.5 (saved-preference check) and Step 4.5 (remember-this follow-up), a new Common Rationalizations row, and two new Quick Reference rows.
- `skills/preferences/SKILL.md` — **modified.** Two stale "W.8" references (frontmatter `description`, Overview paragraph) corrected to "H.1" — noticed while reading this file for context, in scope here since it's the exact map item this plan renames.
- `backlog/finishing-branch-saved-preference.md` — **deleted.** Applied; its own open questions are all resolved by the design doc this plan implements.
- `backlog/README.md` — **modified.** Its pointer line for the deleted backlog file is removed.

---

### Task 1: Saved-preference check and remember-this follow-up in `finishing-a-development-branch`

**Files:**
- Modify: `skills/finishing-a-development-branch/SKILL.md`

**Interfaces:**
- Consumes: `digismith:preferences`' `get`/`set` operations for key `finish_option` (values `merge_locally`/`pr`) — invoke it as a skill by name (`digismith:preferences`), the same way `digismith:bootstrap` invokes `digismith:depot` by name; never re-derive or embed `scripts/preferences.ts`'s own CLI invocation inline in this file.
- Produces: nothing another task in this plan consumes — this is the plan's only behavioral change. Task 2's cleanup is independent (touches different files).

- [ ] **Step 1: Insert Step 3.5 immediately after the existing Step 3 ("Determine Base Branch") and immediately before the existing Step 4 ("Present Options")**

```markdown
## Step 3.5: Check for a Saved Finish Option

Before presenting Step 4's menu, check whether this repo already has a saved
default: invoke `digismith:preferences`' `get` operation for key
`finish_option` (that skill owns its own repo-resolution and invocation
details — this step never duplicates them).

**Only applies to the normal-repo / named-branch-worktree menu** (Step 2's
"Standard 3 options" row). The detached-HEAD 2-option menu never has a saved
default to check — skip this step entirely in that case and go straight to
Step 4's detached-HEAD menu.

**Returns `unset`** → no saved default. Continue to Step 4 exactly as
written, unchanged.

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
```

- [ ] **Step 2: Insert Step 4.5 immediately after the existing Step 4 ("Present Options") and immediately before the existing Step 5 ("Execute Choice")**

```markdown
## Step 4.5: Offer to Remember the Choice

**Only after a fresh Step 4 answer** — never after Step 3.5 skipped the menu
using an already-saved default (that path has its own disposition above,
with no follow-up).

After the human partner answers Step 4's menu with Option 1 or Option 2
(never Option 3 — see below), ask one lightweight follow-up before Step 5
executes:

> "Remember `<merge locally|Push+PR>` as this repo's default, so I stop
> asking?"

**Yes** → write `finish_option` (`merge_locally` for Option 1, `pr` for
Option 2) via `digismith:preferences`' `set` operation.
**No** → proceed normally this run; nothing is written, so Step 3.5 asks
again next time.

**Option 3 (Keep as-is) never gets this follow-up** — it's a one-off
deferral, never a repeatable default, and is never itself a stored value.
Skip straight to Step 5 for Option 3.

Then continue to Step 5 exactly as written.
```

- [ ] **Step 3: Add a Quick Reference row for each new step**

Insert into the existing Quick Reference table (keep every existing row
unchanged, add these two in step order):

```markdown
| 3.5 | Check `digismith:preferences` for a saved `finish_option` (normal-repo/named-branch menu only) — skip straight to Step 5 on a reused saved default (or an override/permanent-change for this run), otherwise fall through to Step 4 unchanged |
| 4.5 | After a *fresh* Step 4 answer of Option 1 or 2 (never 3, never after a Step 3.5 skip), offer to remember it as this repo's default via `digismith:preferences` |
```

- [ ] **Step 4: Add a Common Rationalizations row**

Insert into the existing Common Rationalizations table:

```markdown
| "A saved preference means I can skip the follow-up ask" | The first-run "remember this?" question (Step 4.5) is still required on every fresh menu answer — a saved preference is written only by explicit consent or an explicit "always" instruction, never inferred silently. |
```

- [ ] **Step 5: Self-check — read the whole file end to end**

Confirm: Step 2's environment-detection table (`GIT_DIR`/`GIT_COMMON`
rows) is untouched; Step 3.5's "only applies to the normal-repo/named-branch
menu" clause correctly routes the detached-HEAD case around it; Step 4.5's
"only after a fresh Step 4 answer" clause correctly excludes both Step
3.5's skip path and Option 3; every existing step number (1, 2, 3, 4, 5, 6)
is unchanged; the new prose reads consistently with the surrounding
sections' tone and heading levels (`##` for top-level steps, matching
existing `## Step N:` headings). No automated check exists for this — this
read-through is the verification, per this plan's Global Constraints.

- [ ] **Step 6: Commit**

```bash
git add skills/finishing-a-development-branch/SKILL.md
git commit -m "feat(finishing-a-development-branch): add saved finish-option check (H.1)"
```

---

### Task 2: Cleanup — stale references and backlog retirement

**Files:**
- Modify: `skills/preferences/SKILL.md`
- Delete: `backlog/finishing-branch-saved-preference.md`
- Modify: `backlog/README.md`

**Interfaces:**
- Consumes: nothing from Task 1 — independent, touches entirely different files.
- Produces: nothing another task consumes — purely administrative cleanup.

- [ ] **Step 1: Fix `skills/preferences/SKILL.md`'s two stale "W.8" references**

In the frontmatter `description` field, change:
```
starting with `finishing-a-development-branch`'s saved finish-option check, map item W.8
```
to:
```
starting with `finishing-a-development-branch`'s saved finish-option check, map item H.1
```

In the Overview section, change:
```
first consumer: `finishing-a-development-branch`'s saved finish-option check
(map item W.8, not yet built).
```
to:
```
first consumer: `finishing-a-development-branch`'s saved finish-option check
(map item H.1).
```
(Drop "not yet built" — Task 1 of this same plan builds it.)

- [ ] **Step 2: Delete the now-applied backlog file**

```bash
git rm backlog/finishing-branch-saved-preference.md
```

- [ ] **Step 3: Remove its pointer line from `backlog/README.md`**

Delete this line from the `## Items` list:
```
- [Saved merge-vs-PR preference for finishing-a-development-branch](finishing-branch-saved-preference.md) — captured mid-use of W.4 during W.5's own integration decision; avoid re-asking Option 1 vs 2 every time when the answer is usually predictable per context
```

- [ ] **Step 4: Commit**

```bash
git add skills/preferences/SKILL.md backlog/README.md
git commit -m "docs(preferences): fix stale W.8 references, retire applied saved-finish-option backlog item"
```

(The `git rm` from Step 2 stages the deletion automatically; include it in
this same commit rather than a separate one — `git commit -a` or add the
deletion explicitly if it shows as unstaged: `git add backlog/README.md
skills/preferences/SKILL.md` plus the already-staged deletion.)

---

## Self-Review

**Spec coverage** (against `.digismith/docs/preferences-and-finish-option/design.html`'s H.1 sections):
- `#h1-problem` — motivation only, no task needed.
- `#h1-behavior` (first run, subsequent runs, changing the saved default permanently, applies uniformly) — Task 1's Steps 1-2 (Step 3.5 covers subsequent-runs + permanent-change; Step 4.5 covers first-run's remember-this follow-up; no `IS_DIGISMITH` branch anywhere in either new step, satisfying "applies uniformly").
- `#h1-scope` (normal-repo/named-branch menu only, detached-HEAD out of scope) — Task 1 Step 1's explicit "only applies to" clause.

**Placeholder scan:** no `TBD`/`TODO`/"add appropriate error handling" anywhere above; every step has the literal Markdown to insert.

**Type consistency:** the two `finish_option` values (`merge_locally`, `pr`) are used identically across Task 1's Steps 1, 2, and 3 — no third spelling introduced (H's own store and its tests already lock in these exact strings; this plan introduces no new ones).
