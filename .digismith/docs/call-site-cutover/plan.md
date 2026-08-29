# Call-Site Cutover (W.3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redirect every DigiSmith-internal reference to `superpowers:<name>` over to `digismith:<name>`, across the 10 hand-authored skill files and `MEMORY.md`, for the 6 vendored primitives DigiSmith's own skills actually reference — content-neutral, since the vendored copies are still byte-identical to upstream.

**Architecture:** No script — 11 files, each edited directly with an exact find/replace per occurrence, verified by grep rather than a build step (there is no compiler or test framework that would catch a missed occurrence).

**Tech Stack:** Plain text edits to Markdown `SKILL.md` files and `MEMORY.md`. No code, no dependencies.

## Global Constraints

- The 6 primitive names being cut over (the only ones with any DigiSmith-side reference at all): `brainstorming`, `writing-plans`, `subagent-driven-development`, `executing-plans`, `finishing-a-development-branch`, `using-git-worktrees`. The other 8 vendored names have zero DigiSmith references — nothing to do for them.
- **Out of scope, do not touch:** anything under `skills/vendored-<name>/` (deferred to each skill's own future W.4+ content-activation), `vendored/PROVENANCE.md` (historical record of the clone itself), `scripts/check_vendored_skills.ts` (a separate future item, backlog `W.2.1`), and any actual content change to `finishing-a-development-branch` or any other primitive (map item W.4).
- **One documented exception in `subagent-driven-always/SKILL.md`:** a literal quoted string reproducing `writing-plans`' own unmodified boilerplate text (verified against `writing-plans`' real output: `"REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans"`) must stay exactly as `superpowers:` inside the quotation marks — that text is literal, untouched vendored file content, not DigiSmith's own reference. Only the *attribution* immediately before the quote (naming which skill produces this boilerplate) changes to `digismith:writing-plans`. Detailed in Task 5.
- **No live Skill-tool verification is possible.** A live session's installed plugin snapshot is always one version behind an unmerged branch (`backlog/plugin-cache-lag-self-development.md`) — a `Skill(skill: "digismith:brainstorming", ...)` call from inside this branch will fail with "Unknown skill" regardless of whether this plan's edits are correct. Verification in this plan is grep-based only; live resolution is confirmed after merge, not part of this plan.
- Commit after each task — small, reviewable diffs, one file (or small file group) per commit.

---

### Task 1: Five small files — capture-ephemeral-url, telemetry, init, jira-progress-write-back, offload-implementer

**Files:**
- Modify: `skills/capture-ephemeral-url/SKILL.md` (lines 3, 14, 22)
- Modify: `skills/telemetry/SKILL.md` (lines 3, 22, 254)
- Modify: `skills/init/SKILL.md` (line 15)
- Modify: `skills/jira-progress-write-back/SKILL.md` (line 301)
- Modify: `skills/offload-implementer/SKILL.md` (line 20)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing consumed by later tasks — each file in this plan is independent text.

- [ ] **Step 1: Confirm current state, then make the edits**

Run: `grep -n "superpowers:" skills/capture-ephemeral-url/SKILL.md skills/telemetry/SKILL.md skills/init/SKILL.md skills/jira-progress-write-back/SKILL.md skills/offload-implementer/SKILL.md`
Expected output (confirm it matches before editing — if it doesn't, stop and report the actual output instead of proceeding blind):

```
skills/capture-ephemeral-url/SKILL.md:3:description: Use when a pull request was just created for an Emma Shopify theme repo and its ephemeral-deploy Preview Theme and Theme Editor URLs need to be captured — right after superpowers:finishing-a-development-branch's "push and create PR" option, or when explicitly asked to capture the ephemeral URLs for a given PR.
skills/capture-ephemeral-url/SKILL.md:14:`superpowers:finishing-a-development-branch`'s job) and writes nothing to
skills/capture-ephemeral-url/SKILL.md:22:immediately following `superpowers:finishing-a-development-branch`'s
skills/telemetry/SKILL.md:3:description: Use right after superpowers:finishing-a-development-branch's Step 4 integration-decision menu has been answered (any of its three options).
skills/telemetry/SKILL.md:22:Right after `superpowers:finishing-a-development-branch`'s Step 4 menu
skills/telemetry/SKILL.md:254:This skill's job ends here. `superpowers:finishing-a-development-branch`'s
skills/init/SKILL.md:15:  to `superpowers:brainstorming`. The original `using-digismith` process,
skills/jira-progress-write-back/SKILL.md:301:`superpowers:executing-plans` instead of `subagent-driven-development`,
skills/offload-implementer/SKILL.md:20:`superpowers:subagent-driven-development` — for the task's first attempt,
```

Then make these exact replacements (every occurrence in this list is `superpowers:` → `digismith:`, nothing else changes on these lines):

`skills/capture-ephemeral-url/SKILL.md` line 3 — replace `right after superpowers:finishing-a-development-branch's "push and create PR"` with `right after digismith:finishing-a-development-branch's "push and create PR"`.

`skills/capture-ephemeral-url/SKILL.md` line 14 — replace `` `superpowers:finishing-a-development-branch`'s job) `` with `` `digismith:finishing-a-development-branch`'s job) ``.

`skills/capture-ephemeral-url/SKILL.md` line 22 — replace `` immediately following `superpowers:finishing-a-development-branch`'s `` with `` immediately following `digismith:finishing-a-development-branch`'s ``.

`skills/telemetry/SKILL.md` line 3 — replace `Use right after superpowers:finishing-a-development-branch's Step 4` with `Use right after digismith:finishing-a-development-branch's Step 4`.

`skills/telemetry/SKILL.md` line 22 — replace `` Right after `superpowers:finishing-a-development-branch`'s Step 4 menu `` with `` Right after `digismith:finishing-a-development-branch`'s Step 4 menu ``.

`skills/telemetry/SKILL.md` line 254 — replace `` This skill's job ends here. `superpowers:finishing-a-development-branch`'s `` with `` This skill's job ends here. `digismith:finishing-a-development-branch`'s ``.

`skills/init/SKILL.md` line 15 — replace `` to `superpowers:brainstorming`. `` with `` to `digismith:brainstorming`. ``.

`skills/jira-progress-write-back/SKILL.md` line 301 — replace `` `superpowers:executing-plans` instead of `` with `` `digismith:executing-plans` instead of ``.

`skills/offload-implementer/SKILL.md` line 20 — replace `` `superpowers:subagent-driven-development` — for the task's first attempt, `` with `` `digismith:subagent-driven-development` — for the task's first attempt, ``.

- [ ] **Step 2: Verify**

Run: `grep -c "superpowers:" skills/capture-ephemeral-url/SKILL.md skills/telemetry/SKILL.md skills/init/SKILL.md skills/jira-progress-write-back/SKILL.md skills/offload-implementer/SKILL.md`
Expected: every file reports `:0` (zero remaining `superpowers:` occurrences).

Run: `grep -c "digismith:finishing-a-development-branch\|digismith:brainstorming\|digismith:executing-plans\|digismith:subagent-driven-development" skills/capture-ephemeral-url/SKILL.md skills/telemetry/SKILL.md skills/init/SKILL.md skills/jira-progress-write-back/SKILL.md skills/offload-implementer/SKILL.md`
Expected: `capture-ephemeral-url/SKILL.md:3`, `telemetry/SKILL.md:3`, `init/SKILL.md:1`, `jira-progress-write-back/SKILL.md:1`, `offload-implementer/SKILL.md:1`.

- [ ] **Step 3: Commit**

```bash
git add skills/capture-ephemeral-url/SKILL.md skills/telemetry/SKILL.md skills/init/SKILL.md skills/jira-progress-write-back/SKILL.md skills/offload-implementer/SKILL.md
git commit -m "fix(call-site-cutover): redirect 5 small skill files to digismith: primitives"
```

---

### Task 2: adopt/SKILL.md

**Files:**
- Modify: `skills/adopt/SKILL.md` (lines 3, 15, 204, 205, 206, 210, 243)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Confirm current state, then make the edits**

Run: `grep -n "superpowers:" skills/adopt/SKILL.md`
Expected output (confirm before editing):

```
3:description: Invoked internally by digismith:init when a ticket's spec and plan already exist outside DigiSmith (an external ticket source, vanilla superpowers:brainstorming/superpowers:writing-plans) — never invoke directly.
15:`superpowers:brainstorming`/`superpowers:writing-plans`, with none of
204:Invoke `superpowers:subagent-driven-development` directly against
205:`.digismith/docs/<slug>/plan.md` — `superpowers:brainstorming` and
206:`superpowers:writing-plans` already ran outside DigiSmith for this ticket,
210:`superpowers:subagent-driven-development` dispatch — no special-casing needed, since
243:| 7 | Invoke `superpowers:subagent-driven-development` directly against the relocated `plan.md` |
```

Make these exact replacements (every occurrence: `superpowers:` → `digismith:`):

Line 3 — replace `vanilla superpowers:brainstorming/superpowers:writing-plans` with `vanilla digismith:brainstorming/digismith:writing-plans`.

Line 15 — replace `` `superpowers:brainstorming`/`superpowers:writing-plans`, with none of `` with `` `digismith:brainstorming`/`digismith:writing-plans`, with none of ``.

Line 204 — replace `` Invoke `superpowers:subagent-driven-development` directly against `` with `` Invoke `digismith:subagent-driven-development` directly against ``.

Line 205 — replace `` `.digismith/docs/<slug>/plan.md` — `superpowers:brainstorming` and `` with `` `.digismith/docs/<slug>/plan.md` — `digismith:brainstorming` and ``.

Line 206 — replace `` `superpowers:writing-plans` already ran outside DigiSmith for this ticket, `` with `` `digismith:writing-plans` already ran outside DigiSmith for this ticket, ``.

Line 210 — replace `` `superpowers:subagent-driven-development` dispatch — no special-casing needed, since `` with `` `digismith:subagent-driven-development` dispatch — no special-casing needed, since ``.

Line 243 — replace `` | 7 | Invoke `superpowers:subagent-driven-development` directly against the relocated `plan.md` | `` with `` | 7 | Invoke `digismith:subagent-driven-development` directly against the relocated `plan.md` | ``.

- [ ] **Step 2: Verify**

Run: `grep -c "superpowers:" skills/adopt/SKILL.md`
Expected: `0`

Run: `grep -c "digismith:brainstorming\|digismith:writing-plans\|digismith:subagent-driven-development" skills/adopt/SKILL.md`
Expected: `7` (2 on line 3, 2 on line 15, 1 each on lines 204/210/243, plus lines 205/206 — count total occurrences of the three names: brainstorming×2, writing-plans×2, subagent-driven-development×3 = 7)

- [ ] **Step 3: Commit**

```bash
git add skills/adopt/SKILL.md
git commit -m "fix(call-site-cutover): redirect adopt/SKILL.md to digismith: primitives"
```

---

### Task 3: bootstrap/SKILL.md

**Files:**
- Modify: `skills/bootstrap/SKILL.md` (lines 13, 14, 15, 303, 319, 370, 376, 378, 379, 435)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Confirm current state, then make the edits**

Run: `grep -n "superpowers:" skills/bootstrap/SKILL.md`
Expected output (confirm before editing):

```
13:`superpowers:brainstorming`. Everything after that
14:(`superpowers:writing-plans`,
15:`superpowers:subagent-driven-development`) already chains automatically
303:     `superpowers:using-git-worktrees` would. Use a native worktree tool
319:   to `superpowers:using-git-worktrees` otherwise. Immediately after
370:letting `enforcer` re-derive it. Then invoke `superpowers:brainstorming`, passing
376:`superpowers:brainstorming`'s own process (including its own
378:`superpowers:writing-plans` and
379:`superpowers:subagent-driven-development`/`superpowers:executing-plans`
435:| 3 | Invoke `digismith:enforcer` (passing the already-derived slug) before `superpowers:brainstorming`, then invoke `superpowers:brainstorming` with the Step 1 ticket content as seed context (when there is any); Superpowers' own chain takes over from there |
```

Make these exact replacements (every occurrence: `superpowers:` → `digismith:`):

Line 13 — replace `` `superpowers:brainstorming`. Everything after that `` with `` `digismith:brainstorming`. Everything after that ``.

Line 14 — replace `` (`superpowers:writing-plans`, `` with `` (`digismith:writing-plans`, ``.

Line 15 — replace `` `superpowers:subagent-driven-development`) already chains automatically `` with `` `digismith:subagent-driven-development`) already chains automatically ``.

Line 303 — replace `` `superpowers:using-git-worktrees` would. Use a native worktree tool `` with `` `digismith:using-git-worktrees` would. Use a native worktree tool ``.

Line 319 — replace `` to `superpowers:using-git-worktrees` otherwise. Immediately after `` with `` to `digismith:using-git-worktrees` otherwise. Immediately after ``.

Line 370 — replace `` letting `enforcer` re-derive it. Then invoke `superpowers:brainstorming`, passing `` with `` letting `enforcer` re-derive it. Then invoke `digismith:brainstorming`, passing ``.

Line 376 — replace `` `superpowers:brainstorming`'s own process (including its own `` with `` `digismith:brainstorming`'s own process (including its own ``.

Line 378 — replace `` `superpowers:writing-plans` and `` with `` `digismith:writing-plans` and ``.

Line 379 — replace `` `superpowers:subagent-driven-development`/`superpowers:executing-plans` `` with `` `digismith:subagent-driven-development`/`digismith:executing-plans` ``.

Line 435 — replace `` | 3 | Invoke `digismith:enforcer` (passing the already-derived slug) before `superpowers:brainstorming`, then invoke `superpowers:brainstorming` with the Step 1 ticket content as seed context (when there is any); Superpowers' own chain takes over from there | `` with `` | 3 | Invoke `digismith:enforcer` (passing the already-derived slug) before `digismith:brainstorming`, then invoke `digismith:brainstorming` with the Step 1 ticket content as seed context (when there is any); Superpowers' own chain takes over from there | ``.

Note on line 435: only the two `superpowers:brainstorming` occurrences change. The trailing phrase "Superpowers' own chain takes over from there" is prose about the methodology, not a `superpowers:<name>` token — leave it exactly as written.

- [ ] **Step 2: Verify**

Run: `grep -c "superpowers:" skills/bootstrap/SKILL.md`
Expected: `0`

Run: `grep -o "digismith:brainstorming\|digismith:writing-plans\|digismith:subagent-driven-development\|digismith:using-git-worktrees\|digismith:executing-plans" skills/bootstrap/SKILL.md | wc -l`
Expected: `13` (matches the original 13-occurrence count from the design's inventory)

- [ ] **Step 3: Commit**

```bash
git add skills/bootstrap/SKILL.md
git commit -m "fix(call-site-cutover): redirect bootstrap/SKILL.md to digismith: primitives"
```

---

### Task 4: enforcer/SKILL.md

**Files:**
- Modify: `skills/enforcer/SKILL.md` (lines 3, 10, 11, 33, 34, 72, 184, 261, 273)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Confirm current state, then make the edits**

Run: `grep -n "superpowers:" skills/enforcer/SKILL.md`
Expected output (confirm before editing):

```
3:description: Use when about to invoke superpowers:brainstorming or superpowers:writing-plans for DigiSmith-tracked feature work, or immediately after either one finishes writing its output — via digismith:bootstrap's hand-off, or directly for DigiSmith's own self-development with no ticket involved. Also covers: in plan mode, or "spec"/"plan"/"shape" language, or running brainstorming/writing-plans, for DigiSmith-tracked work specifically.
10:DigiSmith's map item **Q**. `superpowers:brainstorming` and
11:`superpowers:writing-plans` are third-party Superpowers skills with their
33:- **Before** invoking `superpowers:brainstorming` or
34:  `superpowers:writing-plans` — give it the override instruction
72:### Step 1: Advisory — Before `superpowers:brainstorming`
184:### Step 2: Verified — After `superpowers:brainstorming` Reports Completion
261:### Step 4: Advisory — Before `superpowers:writing-plans`
273:### Step 5: Verified — After `superpowers:writing-plans` Reports Completion
```

Make these exact replacements (every occurrence: `superpowers:` → `digismith:`; the phrase "third-party Superpowers skills" on line 11 is prose, not a token — leave it as written):

Line 3 — replace `Use when about to invoke superpowers:brainstorming or superpowers:writing-plans` with `Use when about to invoke digismith:brainstorming or digismith:writing-plans`.

Line 10 — replace `` DigiSmith's map item **Q**. `superpowers:brainstorming` and `` with `` DigiSmith's map item **Q**. `digismith:brainstorming` and ``.

Line 11 — replace `` `superpowers:writing-plans` are third-party Superpowers skills with their `` with `` `digismith:writing-plans` are third-party Superpowers skills with their ``.

Line 33 — replace `` - **Before** invoking `superpowers:brainstorming` or `` with `` - **Before** invoking `digismith:brainstorming` or ``.

Line 34 — replace `` `superpowers:writing-plans` — give it the override instruction `` with `` `digismith:writing-plans` — give it the override instruction ``.

Line 72 — replace `` ### Step 1: Advisory — Before `superpowers:brainstorming` `` with `` ### Step 1: Advisory — Before `digismith:brainstorming` ``.

Line 184 — replace `` ### Step 2: Verified — After `superpowers:brainstorming` Reports Completion `` with `` ### Step 2: Verified — After `digismith:brainstorming` Reports Completion ``.

Line 261 — replace `` ### Step 4: Advisory — Before `superpowers:writing-plans` `` with `` ### Step 4: Advisory — Before `digismith:writing-plans` ``.

Line 273 — replace `` ### Step 5: Verified — After `superpowers:writing-plans` Reports Completion `` with `` ### Step 5: Verified — After `digismith:writing-plans` Reports Completion ``.

- [ ] **Step 2: Verify**

Run: `grep -c "superpowers:" skills/enforcer/SKILL.md`
Expected: `0`

Run: `grep -o "digismith:brainstorming\|digismith:writing-plans" skills/enforcer/SKILL.md | wc -l`
Expected: `10`

- [ ] **Step 3: Commit**

```bash
git add skills/enforcer/SKILL.md
git commit -m "fix(call-site-cutover): redirect enforcer/SKILL.md to digismith: primitives"
```

---

### Task 5: subagent-driven-always/SKILL.md — includes the one documented exception

**Files:**
- Modify: `skills/subagent-driven-always/SKILL.md` (lines 3, 10, 15, 22, 49, 54, 59, 61, 67, 68, 69, 76, 88, 89, 90)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Confirm current state**

Run: `grep -n "superpowers:" skills/subagent-driven-always/SKILL.md`
Expected output (confirm before editing):

```
3:description: Use the moment superpowers:writing-plans reaches its Execution Handoff step and is about to present "1. Subagent-Driven / 2. Inline Execution — Which approach?"
10:DigiSmith's map item **H**. `superpowers:writing-plans` ends every plan
15:review and final-review ledger only `superpowers:subagent-driven-development`
22:The moment `superpowers:writing-plans` reaches its Execution Handoff
49:   `superpowers:executing-plans` instead. Not a live question this skill
54:   invoke `superpowers:executing-plans` automatically. This is exactly
59:   `superpowers:subagent-driven-development` directly.
61:Task count never changes this decision — `superpowers:subagent-driven-development`
67:The plan document's own header line (`superpowers:writing-plans`'
68:boilerplate: "REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
69:(recommended) or superpowers:executing-plans") is untouched — informational
76:- **No subagent capability** → falls back to `superpowers:executing-plans`
88:| User explicitly asked for inline execution | `superpowers:executing-plans` |
89:| No subagent capability available | `superpowers:executing-plans` |
90:| Otherwise (default) | `superpowers:subagent-driven-development` |
```

**Before editing, re-read the actual current file** (not just this grep output) around lines 65-70 to confirm the exact wording of the sentence spanning lines 67-69 — this is the one line group in the entire 11-file scope where the rule is NOT a uniform rewrite, and getting the exact current wording right matters more here than anywhere else in this plan.

- [ ] **Step 2: Make the edits — all normal occurrences (uniform rewrite)**

Line 3 — replace `Use the moment superpowers:writing-plans reaches its Execution Handoff step` with `Use the moment digismith:writing-plans reaches its Execution Handoff step`.

Line 10 — replace `` DigiSmith's map item **H**. `superpowers:writing-plans` ends every plan `` with `` DigiSmith's map item **H**. `digismith:writing-plans` ends every plan ``.

Line 15 — replace `` review and final-review ledger only `superpowers:subagent-driven-development` `` with `` review and final-review ledger only `digismith:subagent-driven-development` ``.

Line 22 — replace `` The moment `superpowers:writing-plans` reaches its Execution Handoff `` with `` The moment `digismith:writing-plans` reaches its Execution Handoff ``.

Line 49 — replace `` `superpowers:executing-plans` instead. Not a live question this skill `` with `` `digismith:executing-plans` instead. Not a live question this skill ``.

Line 54 — replace `` invoke `superpowers:executing-plans` automatically. This is exactly `` with `` invoke `digismith:executing-plans` automatically. This is exactly ``.

Line 59 — replace `` `superpowers:subagent-driven-development` directly. `` with `` `digismith:subagent-driven-development` directly. ``.

Line 61 — replace `` Task count never changes this decision — `superpowers:subagent-driven-development` `` with `` Task count never changes this decision — `digismith:subagent-driven-development` ``.

Line 76 — replace `` - **No subagent capability** → falls back to `superpowers:executing-plans` `` with `` - **No subagent capability** → falls back to `digismith:executing-plans` ``.

Line 88 — replace `` | User explicitly asked for inline execution | `superpowers:executing-plans` | `` with `` | User explicitly asked for inline execution | `digismith:executing-plans` | ``.

Line 89 — replace `` | No subagent capability available | `superpowers:executing-plans` | `` with `` | No subagent capability available | `digismith:executing-plans` | ``.

Line 90 — replace `` | Otherwise (default) | `superpowers:subagent-driven-development` | `` with `` | Otherwise (default) | `digismith:subagent-driven-development` | ``.

- [ ] **Step 3: Make the edit — the one exception (lines 67-69)**

The current text (confirmed against `writing-plans`' own real output, which literally hardcodes `"REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans"` as its plan-header boilerplate — that vendored file is out of scope for this plan and is not being edited, so the quoted string must stay accurate to what it actually contains):

```
The plan document's own header line (`superpowers:writing-plans`'
boilerplate: "REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
(recommended) or superpowers:executing-plans") is untouched — informational
text inside the committed plan file, not a live decision point.
```

Replace with (only the attribution — "`superpowers:writing-plans`'" naming which skill produces this boilerplate — changes to `digismith:writing-plans`, since that's the skill DigiSmith itself now invokes; the literal quoted boilerplate text inside the double quotes stays exactly `superpowers:` because it's an accurate quotation of `writing-plans`' actual unmodified file content):

```
The plan document's own header line (`digismith:writing-plans`'
boilerplate: "REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
(recommended) or superpowers:executing-plans") is untouched — informational
text inside the committed plan file, not a live decision point.
```

- [ ] **Step 4: Verify**

Run: `grep -n "superpowers:" skills/subagent-driven-always/SKILL.md`
Expected: exactly 2 remaining lines, both inside the quoted boilerplate on the former lines 68-69:

```
68:boilerplate: "REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
69:(recommended) or superpowers:executing-plans") is untouched — informational
```

If any *other* line still shows `superpowers:`, the edit is incomplete — go back and fix it. If the two boilerplate-quote lines are missing entirely, something over-corrected the exception — restore the literal quoted text exactly as shown in Step 3.

Run: `grep -o "digismith:writing-plans\|digismith:subagent-driven-development\|digismith:executing-plans" skills/subagent-driven-always/SKILL.md | wc -l`
Expected: `11` (13 original occurrences minus the 2 that stay `superpowers:` inside the quote)

- [ ] **Step 5: Commit**

```bash
git add skills/subagent-driven-always/SKILL.md
git commit -m "fix(call-site-cutover): redirect subagent-driven-always/SKILL.md, preserving writing-plans' literal boilerplate quote"
```

---

### Task 6: report-implementation/SKILL.md

**Files:**
- Modify: `skills/report-implementation/SKILL.md` (lines 3, 14, 21, 29, 40, 41, 63, 74, 159, 208, 424, 543, 545, 600)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Confirm current state, then make the edits**

Run: `grep -n "superpowers:" skills/report-implementation/SKILL.md`
Expected output (confirm before editing):

```
3:description: Use when a `superpowers:subagent-driven-development` plan's final whole-branch review has just come back clean (all findings fixed, parked, or none found) — right before that skill's own Finish step deletes the plan's workspace.
14:`superpowers:subagent-driven-development` plan's completion. Generates an
21:Right when a `superpowers:subagent-driven-development` plan's final
29:`superpowers:finishing-a-development-branch` actually runs.
40:it doesn't (e.g. the plan ran via `superpowers:executing-plans` instead of
41:`superpowers:subagent-driven-development`), this skill's trigger condition
63:    `superpowers:subagent-driven-development`'s Finish step proceed as
74:`superpowers:subagent-driven-development` — not as a sub-dispatched agent.
159:from `superpowers:subagent-driven-development` itself, plus the
208:     `superpowers:subagent-driven-development` (`<N>` tasks, each
424:  <p>Executed via <code>superpowers:subagent-driven-development</code>: fresh implementer
543:`superpowers:subagent-driven-development`'s own Finish step continues
545:`superpowers:finishing-a-development-branch`. Do not re-invoke or
600:| 5 | Hand back to `superpowers:subagent-driven-development`'s unmodified Finish step |
```

Every occurrence here is either a description of DigiSmith's own trigger/behavior, or literal text inside `report-implementation`'s *own* generated `report.html` template (lines 208, 424) — both categories were confirmed in scope for this cutover (unlike Task 5's exception, which was about *quoting a different skill's* unmodified file; this file's template is `report-implementation`'s own output, which it fully controls). Make these exact replacements (`superpowers:` → `digismith:`):

Line 3 — replace `` Use when a `superpowers:subagent-driven-development` plan's final `` with `` Use when a `digismith:subagent-driven-development` plan's final ``.

Line 14 — replace `` `superpowers:subagent-driven-development` plan's completion. Generates an `` with `` `digismith:subagent-driven-development` plan's completion. Generates an ``.

Line 21 — replace `` Right when a `superpowers:subagent-driven-development` plan's final `` with `` Right when a `digismith:subagent-driven-development` plan's final ``.

Line 29 — replace `` `superpowers:finishing-a-development-branch` actually runs. `` with `` `digismith:finishing-a-development-branch` actually runs. ``.

Line 40 — replace `` it doesn't (e.g. the plan ran via `superpowers:executing-plans` instead of `` with `` it doesn't (e.g. the plan ran via `digismith:executing-plans` instead of ``.

Line 41 — replace `` `superpowers:subagent-driven-development`), this skill's trigger condition `` with `` `digismith:subagent-driven-development`), this skill's trigger condition ``.

Line 63 — replace `` `superpowers:subagent-driven-development`'s Finish step proceed as `` with `` `digismith:subagent-driven-development`'s Finish step proceed as ``.

Line 74 — replace `` `superpowers:subagent-driven-development` — not as a sub-dispatched agent. `` with `` `digismith:subagent-driven-development` — not as a sub-dispatched agent. ``.

Line 159 — replace `` from `superpowers:subagent-driven-development` itself, plus the `` with `` from `digismith:subagent-driven-development` itself, plus the ``.

Line 208 — replace `` `superpowers:subagent-driven-development` (`<N>` tasks, each `` with `` `digismith:subagent-driven-development` (`<N>` tasks, each `` (this line is inside the fixed closing-sentence template for `{{SUMMARY_PARAGRAPH}}` — the literal text future reports will embed).

Line 424 — replace `` <p>Executed via <code>superpowers:subagent-driven-development</code>: fresh implementer `` with `` <p>Executed via <code>digismith:subagent-driven-development</code>: fresh implementer `` (this is inside the report HTML template itself — future generated reports will read "Executed via `digismith:subagent-driven-development`").

Line 543 — replace `` `superpowers:subagent-driven-development`'s own Finish step continues `` with `` `digismith:subagent-driven-development`'s own Finish step continues ``.

Line 545 — replace `` `superpowers:finishing-a-development-branch`. Do not re-invoke or `` with `` `digismith:finishing-a-development-branch`. Do not re-invoke or ``.

Line 600 — replace `` | 5 | Hand back to `superpowers:subagent-driven-development`'s unmodified Finish step | `` with `` | 5 | Hand back to `digismith:subagent-driven-development`'s unmodified Finish step | ``.

- [ ] **Step 2: Verify**

Run: `grep -c "superpowers:" skills/report-implementation/SKILL.md`
Expected: `0`

Run: `grep -o "digismith:subagent-driven-development\|digismith:finishing-a-development-branch\|digismith:executing-plans" skills/report-implementation/SKILL.md | wc -l`
Expected: `14`

- [ ] **Step 3: Commit**

```bash
git add skills/report-implementation/SKILL.md
git commit -m "fix(call-site-cutover): redirect report-implementation/SKILL.md, including its own report.html template"
```

---

### Task 7: MEMORY.md

**Files:**
- Modify: `MEMORY.md` (lines ~37, ~100, ~115, ~226, ~238 change; the two clauses in map item W's own row at ~line 119 do NOT change)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Confirm current state**

Run: `grep -n "superpowers:" MEMORY.md`

Expect 6 matching lines: one each around lines 37, 100, 115, 226, 238, and one long map-table row around line 119 (that row contains two separate `superpowers:` clauses within it — read the full row text before touching it, since it's the one line in this task where NOT everything changes).

- [ ] **Step 2: Make the edits that change**

Line ~37 — replace `` stance `superpowers:using-superpowers` takes: if the process applies, it `` with `` stance `digismith:using-superpowers` takes: if the process applies, it ``.

Line ~100 (map item B) — replace `` Carry ticket context *into* `superpowers:brainstorming` so it doesn't start cold `` with `` Carry ticket context *into* `digismith:brainstorming` so it doesn't start cold ``.

Line ~115 (map item Q) — replace `` Makes `superpowers:brainstorming`/`superpowers:writing-plans` honor DigiSmith's unified docs convention `` with `` Makes `digismith:brainstorming`/`digismith:writing-plans` honor DigiSmith's unified docs convention ``.

Line ~226 (Conventions, "Specs are authored in HTML" bullet) — replace `` `superpowers:subagent-driven-development`'s `task-brief` script parses `` with `` `digismith:subagent-driven-development`'s `task-brief` script parses ``.

Line ~238 (Conventions, "Final-review ledger lines are standardized" bullet) — replace `` **Final-review ledger lines are standardized**: `superpowers:subagent-driven-development`'s `` with `` **Final-review ledger lines are standardized**: `digismith:subagent-driven-development`'s ``.

- [ ] **Step 3: Do NOT edit map item W's own row (~line 119)**

Read the current full text of the **W** row before proceeding — it was already updated by a prior commit on this branch (adding "specced 2026-08-29" and a design-doc link for W.3), so don't assume the exact wording from this plan's earlier drafts is still current. Within that row, leave both of these clauses exactly as they are:

- The clause describing the trigger: "...a confirmed gap in upstream `superpowers:finishing-a-development-branch`..." — stays `superpowers:` because the bug being described genuinely lives in the upstream plugin's own code, a fact independent of which prefix DigiSmith uses to invoke its own copy.
- The clause describing W.3 itself (this very task): "...redirect DigiSmith's internal `superpowers:<name>` references to `digismith:<name>`..." — stays exactly as written; the sentence is describing the migration from one prefix to the other and structurally needs both.

If in doubt whether a given piece of the W row's text falls into "changes" or "stays," treat it as "stays" and flag it in your report rather than guessing — this row is the one place in the whole file where the uniform rule doesn't apply, and getting it wrong here is the most visible way this task could go wrong.

- [ ] **Step 4: Verify**

Run: `grep -c "superpowers:" MEMORY.md`
Expected: `1` (only the single map-item-W row remains, and it's expected to still contain the word `superpowers:` — see Step 5 for the precise count within that row)

Run: `grep -o "superpowers:finishing-a-development-branch\|superpowers:<name>" MEMORY.md`
Expected: exactly two matches, both on the map item W row — `superpowers:finishing-a-development-branch` (the upstream-bug clause) and `superpowers:<name>` (the W.3-describes-itself clause).

Run: `grep -o "digismith:using-superpowers\|digismith:brainstorming\|digismith:writing-plans\|digismith:subagent-driven-development" MEMORY.md | wc -l`
Expected: `6` (one each for lines ~37/~226/~238, two for line ~115's brainstorming+writing-plans pair, one for line ~100 — matches the 5 changed occurrences from the design's classification, with line ~115 contributing 2 individual name-tokens)

- [ ] **Step 5: Update map item W's own status line**

Now that W.3 is actually built (not just specced), find the current text in the **W** row that says something like "specced 2026-08-29 (not yet built)" for W.3, and change "(not yet built)" to "(built 2026-08-29)" — read the row's exact current wording first, since it may have drifted from any earlier draft.

- [ ] **Step 6: Commit**

```bash
git add MEMORY.md
git commit -m "fix(call-site-cutover): redirect MEMORY.md's own references, mark W.3 built"
```

---

### Task 8: Final cross-file verification

**Files:**
- No files modified — this task only verifies.

**Interfaces:**
- Consumes: the completed state of Tasks 1-7.
- Produces: nothing — this is the plan's final confirmation step.

- [ ] **Step 1: Confirm zero unintended remaining occurrences across all 10 skill files**

Run:

```bash
grep -rn "superpowers:brainstorming\|superpowers:writing-plans\|superpowers:subagent-driven-development\|superpowers:executing-plans\|superpowers:finishing-a-development-branch\|superpowers:using-git-worktrees" skills/adopt/SKILL.md skills/bootstrap/SKILL.md skills/capture-ephemeral-url/SKILL.md skills/enforcer/SKILL.md skills/init/SKILL.md skills/jira-progress-write-back/SKILL.md skills/offload-implementer/SKILL.md skills/report-implementation/SKILL.md skills/subagent-driven-always/SKILL.md skills/telemetry/SKILL.md
```

Expected: exactly 2 matches, both in `skills/subagent-driven-always/SKILL.md` (the documented boilerplate-quote exception from Task 5). Any other match means an occurrence was missed — go back to the relevant task and fix it.

- [ ] **Step 2: Confirm MEMORY.md's residual is exactly the expected one**

Run: `grep -n "superpowers:" MEMORY.md`
Expected: exactly one line (map item W's own row), containing exactly two `superpowers:` occurrences as described in Task 7.

- [ ] **Step 3: Confirm nothing out-of-scope was touched**

Run: `git log --oneline` and find the commit for "docs(call-site-cutover): note the boilerplate-quote exception found during planning" (the design-doc correction made just before this plan started execution) — that is the base to diff from. Then run `git diff --stat <that-commit>..HEAD`.

Expected: only the 11 files from Tasks 1-7 appear (`MEMORY.md` plus the 10 `skills/*/SKILL.md` files). Confirm nothing under `skills/vendored-*/` or `vendored/PROVENANCE.md` appears in the diff — if either does, something went wrong and needs investigating before this task is considered complete.

- [ ] **Step 4: Record the pre-merge testing limitation**

No code change or commit here — just confirm understanding for whoever reviews this plan's execution: live `Skill`-tool resolution of `digismith:brainstorming` (or any other cut-over name) cannot be verified from inside this branch, because a running session's installed plugin snapshot predates this branch's own changes (`backlog/plugin-cache-lag-self-development.md`). That confirmation happens naturally the next time any of these skills is actually invoked after this branch merges and the plugin reinstalls — not as a step of this plan.

This task produces no commit (verification only, nothing to stage).
