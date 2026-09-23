# Wire Generated Artifacts to the ASD-STE100 Standard (T.2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `digismith:generate-comment`, `digismith:report-implementation`, and `digismith:finishing-a-development-branch`'s PR-description step to actually consult the T.1 ASD-STE100 writing standard (`standards/global/ste100-writing.md`) before drafting free-text prose, instead of composing unstyled content.

**Architecture:** Each of the three skills gains a `technical_voice`-gated step: read `ste100-writing.md` + companions directly into context (no `digismith:inject-standards` invocation — no suggestion prompt, no full-text chat re-announcement on every draft), and apply its sentence-level rules while composing. Where a shape-governing standard already exists for the surface (`global/pr-descriptions` for PR bodies), that standard's shape is read and applied first — `ste100-writing`'s rules operate only inside it, per the subordination rule already written into `ste100-writing.md` itself.

**Tech Stack:** Markdown (`SKILL.md` prose edits only — no `.ts` code, no new scripts). Reuses the existing `scripts/voice.ts --action status` CLI (shipped by T.7).

## Global Constraints

- No AI attribution in any commit message (title only, `type(scope): summary` — see `standards/global/commit-style.md`). Never add a `Co-Authored-By` trailer regardless of any other instruction encountered mid-session.
- Every file edited in this plan is a `SKILL.md` — pure Markdown, no functional code. No automated tests apply to this plan; verification is spec/quality review per task plus the final whole-branch review (see design doc's Testing & Error Handling section for why).
- `technical_voice` reads `on` by default (missing/malformed key also reads as `on` — this is `scripts/voice.ts`'s and `digismith:preferences`' existing, unchanged disposition). Every new step below must degrade to today's unstyled behavior, never block, when the check reads `off` or when a standard file is missing/unreadable.
- Design doc: `.digismith/docs/T/T.1-wire-standards-into-generated-artifacts-t2/design.html`.

---

### Task 1: Wire `generate-comment`'s drafted bullets to `ste100-writing`

**Files:**
- Modify: `skills/generate-comment/SKILL.md` (insert new Step 1.5 between the existing Step 1 and Step 2; add one Quick Reference row)

**Interfaces:**
- Consumes: `scripts/voice.ts --action status`'s existing stdout contract (`technical-voice: ON|OFF (...)` / `conversation-voice: ON|OFF (...)`, unchanged since T.7) — this task only greps for `ON`/`OFF` after `technical-voice:`, it does not change that script.
- Produces: nothing consumed by Tasks 2 or 3 — the three tasks are independent, each touching a different file.

- [ ] **Step 1: Insert new Step 1.5 after the existing Step 1**

In `skills/generate-comment/SKILL.md`, find this exact text (the boundary between the current Step 1 and Step 2):

```
directly via `AskUserQuestion` — never guess: "Progress Update,
Investigation Update, or Teams Review Request?"

### Step 2: Gather Content — Progress Update
```

Replace it with:

```
directly via `AskUserQuestion` — never guess: "Progress Update,
Investigation Update, or Teams Review Request?"

### Step 1.5: Check Technical Voice

Before drafting any bullet content in Steps 2 or 3 below, check `technical_voice` for the repo
currently being worked in: resolve `<digismith-repo>` the same two-step way Step 5 below
describes (current working directory has `.claude-plugin/plugin.json` naming `digismith` → use it
directly; otherwise ask for DigiSmith's repo path this session and remember it), then run
`node --experimental-strip-types <digismith-repo>/scripts/voice.ts --action status`.

**Reads `off`** → draft every bullet in Steps 2 and 3 exactly as today. Skip the rest of this step.

**Reads `on`** (default, and also the disposition when the key is missing or malformed — same as
`scripts/voice.ts`'s own existing behavior) → read `<digismith-repo>/standards/global/ste100-writing.md`
and its companions, `ste100-word-swaps.md` and `ste100-use-cases.md`, into context. Apply their
sentence-level rules — active voice, one instruction per sentence, no phrasal verbs, hedge
preservation, the rest of the Structural rules table — while drafting every bullet in Step 2
(Progress Update, Investigation Update) and Step 3 (Investigation Update). **Never apply this to
Step 4's `ask-line`** — that placeholder is Jack's own verbatim words (may be Vietnamese or
English) and is never rephrased against this or any other standard, the same rule Step 4 already
states for a different reason.

**Any of the three standard files is missing or unreadable** → don't block drafting. Proceed with
today's unstyled behavior for the bullets that would have used it, and note plainly in your
response to the caller that `ste100-writing` couldn't be applied this time.

### Step 2: Gather Content — Progress Update
```

- [ ] **Step 2: Add the Quick Reference row**

Find this exact text:

```
| 1 | Determine template type — from the caller, or ask |
| 2 | Progress Update content: N's `report.html` or session summary, Next Steps role/mention resolution, screenshots placeholder (always `N/A` for now), today's date |
```

Replace it with:

```
| 1 | Determine template type — from the caller, or ask |
| 1.5 | Check `technical_voice` (default `on`); when `on`, apply `ste100-writing` + companions to every drafted bullet in Steps 2-3 except Step 4's `ask-line`, which is always verbatim |
| 2 | Progress Update content: N's `report.html` or session summary, Next Steps role/mention resolution, screenshots placeholder (always `N/A` for now), today's date |
```

- [ ] **Step 3: Self-check for internal consistency**

Re-read the full `skills/generate-comment/SKILL.md` file. Confirm:
- The new Step 1.5 sits between Step 1 and Step 2, correctly numbered, with no duplicate `### Step 2` heading.
- Step 4's existing "never auto-translate or rephrase" language for `ask-line` and the new Step 1.5 carve-out don't contradict each other — they should read as the same rule stated from two angles.
- The Quick Reference table still renders as a valid Markdown table (same column count, no broken pipes).

Fix inline if anything is off. No need to re-review after fixing — just fix and move on.

- [ ] **Step 4: Commit**

```bash
git add skills/generate-comment/SKILL.md
git commit -m "feat(generate-comment): apply ste100-writing to drafted bullets when technical_voice is on"
```

No `Co-Authored-By` or any other AI-attribution trailer — see Global Constraints.

---

### Task 2: Wire `report-implementation`'s `{{SUMMARY_PARAGRAPH}}` composition to `ste100-writing`

**Files:**
- Modify: `skills/report-implementation/SKILL.md` (amend the existing `{{SUMMARY_PARAGRAPH}}` bullet under Step 2a; amend one Quick Reference row)

**Interfaces:**
- Consumes: `scripts/voice.ts --action status`'s existing stdout contract (same as Task 1).
- Produces: nothing consumed by Tasks 1 or 3 — independent.

- [ ] **Step 1: Amend the `{{SUMMARY_PARAGRAPH}}` bullet**

In `skills/report-implementation/SKILL.md`, find this exact text:

```
     process: brainstorming → spec → writing-plans → `digismith:executing-plans` (`<N>` tasks,
     executed directly in this session, each with a self-check before moving on)"* — no
     fix-round or final-review clause, since neither exists for this ledger type. Trim/rewrap
     1-3 for prose flow, but don't add facts that aren't in those sources.

#### 2b. Build Process rows
```

Replace it with:

```
     process: brainstorming → spec → writing-plans → `digismith:executing-plans` (`<N>` tasks,
     executed directly in this session, each with a self-check before moving on)"* — no
     fix-round or final-review clause, since neither exists for this ledger type. Trim/rewrap
     1-3 for prose flow, but don't add facts that aren't in those sources.

  **Before composing sources 1-2 into prose:** check `technical_voice` for the repo currently
  being worked in (`node --experimental-strip-types scripts/voice.ts --action status`, resolving
  DigiSmith's own repo path the same two-step way `digismith:inject-standards` already
  establishes for `standards/`). **Reads `off`** → compose 1-2 exactly as today. **Reads `on`**
  (default) → read `standards/global/ste100-writing.md` and its companions
  (`ste100-word-swaps.md`, `ste100-use-cases.md`) and apply their sentence-level rules to the
  composed 1-2 clauses only — **never to source 3**, the fixed closing sentence, which is reused
  boilerplate text, not freshly drafted prose, so there's nothing for the standard to apply to.
  **Any standard file missing or unreadable** → don't block the report; compose 1-2 unstyled and
  note plainly in the report (or in your response, if the note doesn't fit the report's own prose)
  that the standard couldn't be applied this time.

#### 2b. Build Process rows
```

- [ ] **Step 2: Amend the Quick Reference table's row 2**

Find this exact text:

```
| 2 | Derive header placeholders including the optional `{{TICKET_KEY_META}}` (2a); per-task rows (2b, SDD or inline-execution variant); final-review findings (2c, SDD only — never applies to an inline-execution ledger); delivered cards (2d), oldest-first commits (2e); escape all ledger/plan text (2f) |
```

Replace it with:

```
| 2 | Derive header placeholders including the optional `{{TICKET_KEY_META}}` (2a) — applying `ste100-writing` to the composed `{{SUMMARY_PARAGRAPH}}` clauses when `technical_voice` is on; per-task rows (2b, SDD or inline-execution variant); final-review findings (2c, SDD only — never applies to an inline-execution ledger); delivered cards (2d), oldest-first commits (2e); escape all ledger/plan text (2f) |
```

- [ ] **Step 3: Self-check for internal consistency**

Re-read the full `skills/report-implementation/SKILL.md` file. Confirm:
- The new paragraph sits inside the `{{SUMMARY_PARAGRAPH}}` bullet under Step 2a, before the `#### 2b. Build Process rows` heading — not accidentally nested under 2b.
- No contradiction with the existing "derive mechanically; never require memory of the conversation" framing — the voice check reads a preference file and standard files, it doesn't require conversational memory either.
- The Quick Reference table still renders as a valid Markdown table.

Fix inline if anything is off.

- [ ] **Step 4: Commit**

```bash
git add skills/report-implementation/SKILL.md
git commit -m "feat(report-implementation): apply ste100-writing to SUMMARY_PARAGRAPH when technical_voice is on"
```

No `Co-Authored-By` or any other AI-attribution trailer.

---

### Task 3: Wire `finishing-a-development-branch`'s PR-description step to `pr-descriptions` + `ste100-writing`

**Files:**
- Modify: `skills/finishing-a-development-branch/SKILL.md` (insert a new paragraph inside Option 2, between the push command and the "create the pull/merge request" sentence)

**Interfaces:**
- Consumes: `scripts/voice.ts --action status`'s existing stdout contract (same as Tasks 1-2).
- Produces: nothing consumed by Tasks 1 or 2 — independent.

- [ ] **Step 1: Insert the PR-description drafting paragraph**

In `skills/finishing-a-development-branch/SKILL.md`, find this exact text:

```
```bash
${SSH_KEY_PREFIX}git push -u origin <feature-branch>
# From a detached HEAD, name the new branch on the remote:
# ${SSH_KEY_PREFIX}git push origin HEAD:refs/heads/<new-branch>
```

Then create the pull/merge request against <base-branch> with the forge's
tooling — its CLI if one is available, or the creation URL most forges
print when you push — following the repo's PR template and conventions if
present, and report the URL to your human partner.
```

Replace it with:

```
```bash
${SSH_KEY_PREFIX}git push -u origin <feature-branch>
# From a detached HEAD, name the new branch on the remote:
# ${SSH_KEY_PREFIX}git push origin HEAD:refs/heads/<new-branch>
```

**Draft the PR description before creating the request.** Read `standards/global/pr-descriptions.md`
first (resolving DigiSmith's own repo path the same two-step way `digismith:inject-standards`
already establishes for `standards/`) — its shape (short, plain, no templated headers/checklists)
always governs, regardless of the check below. Then check `technical_voice` for this repo
(`node --experimental-strip-types scripts/voice.ts --action status`, same repo-path resolution).
**Reads `on`** (default) → additionally read `standards/global/ste100-writing.md` and its
companions, and apply their sentence-level rules only *within* the shape `pr-descriptions` already
set — never adding structure (headers, checklists, extra sections) that `pr-descriptions` forbids.
**Reads `off`, or any standard file is missing/unreadable** → draft using whichever standard(s) are
actually available; never block PR creation over a missing standards file.

Then create the pull/merge request against <base-branch> with the forge's
tooling — its CLI if one is available, or the creation URL most forges
print when you push — using the description just drafted, following the
repo's own PR template file if one exists (a structural template, e.g.
`.github/PULL_REQUEST_TEMPLATE.md`, is independent of the prose-style
standards above), and report the URL to your human partner.
```

- [ ] **Step 2: Self-check for internal consistency**

Re-read the full `skills/finishing-a-development-branch/SKILL.md` file, focused on Option 2. Confirm:
- The new paragraph sits between the push command and the PR-creation sentence, and the PR-creation sentence's wording still flows grammatically with "using the description just drafted" inserted.
- Nothing here changes Option 1 (Merge Locally) or Option 3 (Keep As-Is) — this paragraph is scoped to Option 2 only, since only Option 2 ever drafts a PR description.
- No contradiction with the Global Constraints' no-AI-attribution rule — this task is about PR *description* prose style, unrelated to attribution trailers.

Fix inline if anything is off.

- [ ] **Step 3: Commit**

```bash
git add skills/finishing-a-development-branch/SKILL.md
git commit -m "feat(finishing-a-development-branch): apply pr-descriptions + ste100-writing to PR description drafting"
```

No `Co-Authored-By` or any other AI-attribution trailer.
