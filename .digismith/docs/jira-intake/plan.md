# Ticket Intake (A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `jira-intake` skill — DigiSmith's map item A — so a
ticket key/paste (Door 1) or a raw need (Door 2) both converge on the same
structured `docs/<slug>/ticket.md` artifact.

**Architecture:** A single skill, `skills/jira-intake/SKILL.md`. Both
doors share one template and one write path (slug derivation → existing-file
branching → write); only how the content gets gathered differs between
them. No new library code, no JIRA API integration — detection is a
runtime check for whatever JIRA/Atlassian-capable tool the current session
happens to have, with paste as the universal fallback.

**Tech Stack:** Claude Code Skills (`SKILL.md`, YAML frontmatter), plain
Markdown ticket template. No application code, no test framework — this is
an instruction file, same as G's four standards skills.

## Global Constraints

- Skill frontmatter requires `name` and `description`; description starts
  with "Use when…", third person, states triggering conditions only —
  never a workflow summary (per `superpowers:writing-skills`'s Skill
  Discovery Optimization rules).
- Output artifact: `docs/<feature-slug>/ticket.md`, inside the repo
  currently being worked in (never DigiSmith's own repo) — same folder
  specs/plans/reports will eventually use for that feature, gitignored,
  matching the existing `team/docs-conventions` standard already in place
  for Emma repos.
- Slug derivation: lowercase the title, replace non-alphanumeric runs with
  a single hyphen, truncate to ~40 characters cut at a word boundary.
  Worked example from the spec: "Fix cart drawer padding on mobile
  checkout" → `fix-cart-drawer-padding-mobile`.
- `jira-intake` never estimates Story Points (captured as-is if already
  set on an ingested ticket, otherwise "TBD" — that's **J**'s job) and
  never writes back to JIRA (Door 2's output is a local draft only — that's
  the not-yet-built "JIRA write-back" shared primitive).
- Not building any real JIRA API/MCP integration — detect at runtime
  whether a JIRA/Atlassian-capable tool exists in the current session,
  same principle `inject-standards` already uses for its own scenario
  detection. Never hardcode an assumption; never block on JIRA access that
  doesn't exist in this environment today.
- Cross-skill references inside `SKILL.md` content must be plugin-qualified:
  `digismith:discover-standards`, `digismith:inject-standards`.
- No automated test suite for `SKILL.md` files. Verification is a
  dogfooding pass: dispatch a subagent with the skill's content as its
  instructions and a concrete scenario, then check its behavior — per
  `superpowers:writing-skills`'s "Technique Skill" testing method, same
  convention G's four skills used.
- Dogfood runs write real `docs/<slug>/ticket.md` files into this repo
  (DigiSmith itself, standing in as "the repo currently being worked in"
  for test purposes) — DigiSmith's own `.gitignore` only excludes
  `.idea/`, so these are test scaffolding that must be deleted before each
  task's commit, never staged.

---

### Task 1: `jira-intake` Skill — Both Doors, Happy Path

**Files:**
- Create: `skills/jira-intake/SKILL.md`

**Interfaces:**
- Consumes: nothing from earlier tasks (first task in this plan).
- Produces: `docs/<slug>/ticket.md` in whatever repo the skill runs
  against. Task 2 depends on this file existing and behaving correctly for
  its edge-case dogfooding.

This task writes the full skill (both doors, the template, slug
derivation, JIRA detection, and all error-handling behavior) and verifies
the two straight-line happy paths: Door 1 with pasted content, and Door 2
from a raw need — including Door 2's "skip the question if already
answered" shortcut. Task 2 covers the three existing-file branch cases
(refresh / collision / upgrade) plus the two "can't proceed" cases
separately, since those are the scenarios most likely to get one written
correctly and the other wrong.

- [ ] **Step 1: Write `skills/jira-intake/SKILL.md`**

```markdown
---
name: jira-intake
description: Use when the user wants to bring a ticket into DigiSmith's workflow — names an existing JIRA/Atlassian ticket by key or pastes its content, or describes a raw feature need with no ticket yet that should be shaped into one. Produces a structured docs/<slug>/ticket.md for either path.
---

# Jira Intake

## Overview

One entry point, two doors, per DigiSmith's philosophy #4. A ticket
already exists → ingest it (Door 1). No ticket yet, just a need → shape
one (Door 2). Both converge on the same `docs/<slug>/ticket.md` shape.
`jira-intake` stops once that file exists — grounding it in the codebase
is **L**, estimating Story Points is **J**, both separate later stages.

## When to Use

The user names an existing ticket — a key, a URL, or ticket text to paste
— use Door 1. The user describes a need with no ticket yet — use Door 2.

## Process

### Step 1: Determine the Door

If not already obvious from what the user said, ask which applies: does a
ticket already exist, or are we shaping one from a raw need?

### Step 2a (Door 1): Ticket Exists

1. Ask for the ticket key.
2. Check whether a JIRA/Atlassian-capable tool is available in this
   session (see JIRA Detection below).
   - Available → fetch the ticket by key.
   - Not available → say so plainly, ask the user to paste the ticket
     content directly.
3. Neither a tool nor a pasted-content answer available (user declines to
   paste) → stop cleanly (see Error Handling). Don't fabricate a ticket.
4. Pasted content too sparse to extract a title/description → say so,
   offer a cleaner paste or switching to Door 2 instead (see Error
   Handling).
5. Map the result into the Ticket Template. No confirmation step here —
   this is transcription of already-real content, not a draft.
6. Continue to Step 3 (Write).

### Step 2b (Door 2): Raw Need → Shaped Ticket

1. Take the user's description as the seed.
2. Check what's still missing for the required fields (Title,
   Description, Acceptance Criteria). If everything needed is already
   inferable from what was said, skip straight to drafting — don't ask a
   question whose answer was already given.
3. Otherwise ask only for what's missing, one question at a time via
   `AskUserQuestion` — never a batch of questions for information already
   inferable from what was said.
4. Draft the ticket using the Ticket Template (Key/URL omitted entirely,
   Story Points "TBD").
5. Confirm the draft with the user before writing — same ask → draft →
   confirm shape `digismith:discover-standards` already uses.
6. Continue to Step 3 (Write) once confirmed.

### Step 3: Derive the Slug and Write

1. Derive the slug from the title: lowercase, replace non-alphanumeric
   runs with a single hyphen, truncate to ~40 characters cut at a word
   boundary. Example: "Fix cart drawer padding on mobile checkout" →
   `fix-cart-drawer-padding-mobile`.
2. Target path: `docs/<slug>/ticket.md`, in the repo currently being
   worked in.
3. Check for an existing file at that path first — see Handling Existing
   Files below — before writing.
4. Write the file in the Ticket Template shape.

## Ticket Template

```
# <Title>

**Key:** EMKT-1234 (Door 1 only — omitted if the ticket doesn't exist yet)
**URL:** https://... (Door 1 only, if available)
**Story Points:** 3 (captured as-is if already set; otherwise "TBD" — jira-intake never estimates)

## Description

...

## Acceptance Criteria

- ...
- ...
```

## JIRA Detection

Door 1 doesn't assume any specific JIRA integration exists. At runtime,
check whether a JIRA- or Atlassian-capable tool is available in the
current session — same principle `digismith:inject-standards` already
uses for its own scenario detection: infer from what's actually
available, don't hardcode an assumption. Found → use it to fetch the
ticket by key. Not found → tell the user plainly and ask them to paste
the ticket content instead. Never block on JIRA access that doesn't exist
in this environment today.

## Handling Existing Files at the Target Slug

Before writing, check whether `docs/<slug>/ticket.md` already exists:

| Existing file's `Key` | Incoming | Action |
|---|---|---|
| No existing file | — | Write directly |
| Same as incoming key | Door 1, same key (a re-run) | Confirm before overwriting via `AskUserQuestion` |
| Different from incoming key | Door 1, different key, same slug (a collision) | Ask whether to disambiguate — append the ticket key to the slug, or choose a different slug — rather than silently overwriting |
| Blank/absent (a Door 2 draft) | Door 1, now has a real key | Upgrade, not a collision — fill in Key/URL/Story Points on the existing file rather than creating a duplicate or asking about a conflict |

## Error Handling

- **No JIRA tool and the user declines to paste** → stop cleanly: explain
  that `jira-intake` needs either a JIRA tool in this session or pasted
  ticket content to proceed. Don't fabricate a ticket.
- **Pasted content too sparse** to extract a title/description → say so,
  offer either a cleaner paste or switching to Door 2's raw-need flow
  instead.
- **Existing file at the target slug** → see Handling Existing Files
  above; branch by the table, never silently overwrite.

## Quick Reference

| Step | Action |
|---|---|
| 1 | Determine the door |
| 2a | Door 1: get key, detect JIRA tool, fetch or ask for paste |
| 2b | Door 2: seed from description, ask only what's missing, draft, confirm |
| 3 | Derive slug, branch on existing file (refresh / collision / upgrade / none), write `docs/<slug>/ticket.md` |
```

- [ ] **Step 2: Dogfood Door 1 — pasted ticket, happy path**

Dispatch a subagent (Agent tool, general-purpose) with this prompt:

```
Follow the instructions in D:\Workspace\Jazurite\DigiSmith\skills\jira-intake\SKILL.md
exactly, operating on D:\Workspace\Jazurite\DigiSmith\ as "the repo
currently being worked in". This is Door 1. No JIRA tool exists in this
session (there isn't one), so go straight to asking for pasted content —
skip the AskUserQuestion prompt for the ticket key and just use the paste
below directly, as if the user had already supplied both (this is an
automated dogfood run, not an interactive session):

  Key: EMKT-9001
  Title: Fix cart drawer padding on mobile checkout
  URL: https://jazurite.atlassian.net/browse/EMKT-9001
  Story Points: 3

  Description:
  On mobile viewports, the cart drawer has 4px extra padding at the
  bottom that misaligns with the checkout button. Should match desktop
  padding value.

  Acceptance Criteria:
  - Cart drawer bottom padding matches desktop (16px)
  - Verified on iOS Safari and Android Chrome
  - No visual regression on tablet breakpoint

Write the resulting ticket.md. Report the exact file path written and its
full contents.
```

Expected: file written at
`docs/fix-cart-drawer-padding-mobile/ticket.md` (matching the spec's own
worked slug example exactly), containing the title as an H1, `**Key:**
EMKT-9001`, `**URL:**` line, `**Story Points:** 3`, and the description
and three acceptance criteria under their headings.

- [ ] **Step 3: Verify Step 2's output directly**

```bash
cat docs/fix-cart-drawer-padding-mobile/ticket.md
```

Expected: matches the reported content — real file, not just a claim in
the subagent's report.

- [ ] **Step 4: Dogfood Door 2 — rough incomplete need**

Dispatch a subagent (Agent tool, general-purpose) with this prompt:

```
Follow the instructions in D:\Workspace\Jazurite\DigiSmith\skills\jira-intake\SKILL.md
exactly, operating on D:\Workspace\Jazurite\DigiSmith\ as "the repo
currently being worked in". This is Door 2. The user's raw need: "We need
a way for users to filter the product grid by color swatch." No
acceptance criteria were given. Per the skill, ask only for what's
missing — since this is an automated dogfood run, answer your own
clarifying question yourself with a reasonable answer instead of stopping
to wait for a human, then draft, confirm (auto-accept your own draft),
and write. Report: the clarifying question you generated, the answer you
gave yourself, the file path written, and its full contents.
```

Expected: report shows exactly one clarifying question (about acceptance
criteria — the only missing required field), a file written at
`docs/<some-slug>/ticket.md` with no `**Key:**`/`**URL:**` lines,
`**Story Points:** TBD`, and acceptance criteria present.

- [ ] **Step 5: Dogfood Door 2 — already-complete need (skip the question)**

Dispatch a subagent (Agent tool, general-purpose) with this prompt:

```
Follow the instructions in D:\Workspace\Jazurite\DigiSmith\skills\jira-intake\SKILL.md
exactly, operating on D:\Workspace\Jazurite\DigiSmith\ as "the repo
currently being worked in". This is Door 2. The user's raw need is fully
specified already: "Add a 'Recently Viewed' section to the product page,
showing the last 4 products the shopper viewed, stored in localStorage.
Acceptance criteria: section is hidden if history is empty; shows up to 4
products in view order, most recent first; persists across page reloads
via localStorage; clicking a product navigates to its PDP." Per the
skill, if everything needed is already inferable, skip the clarifying
question entirely. Draft, confirm (auto-accept your own draft), and
write. Report whether you asked a clarifying question (expected: no) and
the file path + contents written.
```

Expected: report confirms no clarifying question was asked, and the
written file has all four acceptance criteria captured, `**Story
Points:** TBD`, no `**Key:**`/`**URL:**` lines.

- [ ] **Step 6: Verify Steps 4-5's output directly, then clean up all Task 1 dogfood artifacts**

```bash
ls docs/
cat docs/*/ticket.md
```

Confirm three `docs/<slug>/` folders exist (one per dogfood run above)
with the expected shapes, then remove them — this repo isn't the feature
those tickets belong to, they're test scaffolding:

```bash
rm -rf docs/fix-cart-drawer-padding-mobile
# remove the other two slug folders created in Steps 4 and 5 (use the
# exact slugs reported by those subagents)
git status docs/
```

Expected: `git status` shows no untracked/modified files under `docs/`
(these were never tracked, `.gitignore` doesn't need to cover them for
this cleanup to matter, but nothing should be left behind either way).

- [ ] **Step 7: Commit**

```bash
git add skills/jira-intake/SKILL.md
git commit -m "feat(intake): add jira-intake skill, both doors happy path"
```

---

### Task 2: `jira-intake` Edge Cases — Existing-File Branching & Can't-Proceed Paths

**Files:**
- Modify: `skills/jira-intake/SKILL.md` (only if a dogfood run below
  surfaces a real gap in Task 1's content — see Step-by-step notes; no
  changes are expected if Task 1's content is correct)

**Interfaces:**
- Consumes: `skills/jira-intake/SKILL.md` from Task 1, unchanged unless a
  gap is found.
- Produces: nothing new downstream — this task is verification of the
  five remaining spec-required scenarios not covered in Task 1.

Task 1 proved the happy paths. This task proves the skill doesn't silently
clobber or fabricate anything when the input is imperfect — the three
existing-file branches (refresh / collision / upgrade) from the Handling
Existing Files table, plus the two stop-and-say-so cases from Error
Handling.

- [ ] **Step 1: Dogfood the refresh case — re-run Door 1 on the same key**

Dispatch a subagent (Agent tool, general-purpose):

```
Follow the instructions in D:\Workspace\Jazurite\DigiSmith\skills\jira-intake\SKILL.md
exactly, operating on D:\Workspace\Jazurite\DigiSmith\. First, write an
initial ticket.md by running Door 1 with this pasted content (skip
confirmation, this is setup for the real test):

  Key: EMKT-9001
  Title: Fix cart drawer padding on mobile checkout
  Story Points: 3
  Description: Initial description.
  Acceptance Criteria:
  - Initial AC.

Now run Door 1 again for the SAME key, EMKT-9001, with slightly different
pasted content (Story Points now 5, description changed to "Updated
description after refinement", same acceptance criteria). Per the skill's
Handling Existing Files table, this should be detected as a refresh (same
key) and should ask for overwrite confirmation via AskUserQuestion rather
than silently overwriting. Report: did it detect the refresh case and ask
before overwriting? What did the AskUserQuestion prompt say? After
confirming yes, report the final file contents.
```

Expected: report confirms the skill recognized the same-key case and
asked before overwriting (not silent), and the final file reflects the
updated Story Points (5) and description.

- [ ] **Step 2: Dogfood the collision case — different key, same slug**

Dispatch a subagent (Agent tool, general-purpose):

```
Follow the instructions in D:\Workspace\Jazurite\DigiSmith\skills\jira-intake\SKILL.md
exactly, operating on D:\Workspace\Jazurite\DigiSmith\. A file already
exists at docs/fix-cart-drawer-padding-mobile/ticket.md with Key EMKT-9001
(from prior testing — if it doesn't exist, create it first via Door 1 with
that key and title "Fix cart drawer padding on mobile checkout", skipping
confirmation).

Now run Door 1 for a DIFFERENT ticket that derives to the same slug: Key
EMKT-9099, Title "Fix cart drawer padding on mobile" (same slug-relevant
words, different key), Story Points 1, Description "Unrelated smaller
fix", Acceptance Criteria "- Unrelated AC". Per the skill's Handling
Existing Files table, this is a collision (different key, same slug) —
it should ask whether to disambiguate rather than overwrite. Report: did
it detect the collision and offer disambiguation? What options did it
present? Do NOT actually let it silently overwrite the EMKT-9001 file —
if it tries to, stop and report that as a failure instead of proceeding.
```

Expected: report confirms collision detection and a disambiguation offer
(append key to slug, or choose a different slug) — explicitly not a
silent overwrite of the EMKT-9001 file.

- [ ] **Step 3: Dogfood the upgrade case — Door 2 draft, then Door 1 for real**

Dispatch a subagent (Agent tool, general-purpose):

```
Follow the instructions in D:\Workspace\Jazurite\DigiSmith\skills\jira-intake\SKILL.md
exactly, operating on D:\Workspace\Jazurite\DigiSmith\. First run Door 2
for this raw need (skip clarifying questions, invent a reasonable answer
yourself, auto-confirm the draft): "Add a wishlist icon to product cards
on the collection grid. Acceptance criteria: icon toggles filled/outline
on click; wishlist state persists in localStorage; icon has an
accessible label." This should write a draft ticket.md with no Key/URL,
Story Points TBD.

Now run Door 1 for what should resolve to the SAME slug, with real ticket
content: Key EMKT-9150, same title "Add a wishlist icon to product cards
on the collection grid", Story Points 5, matching description and
acceptance criteria. Per the skill's Handling Existing Files table, the
existing file has a blank Key (a Door 2 draft) — this is an upgrade, not
a collision or a plain refresh. It should fill in Key/URL/Story Points on
the EXISTING file without asking a collision question and without
creating a duplicate file. Report: the slug used both times (confirm they
matched), whether it correctly treated this as an upgrade (no collision
question asked), and the final file contents (Key, Story Points, and
description all reflecting the Door 1 content).
```

Expected: report confirms both runs resolved to the same slug, no
collision question was asked, and the final file has `**Key:**
EMKT-9150`, `**Story Points:** 5`, and Door 1's content — a single file,
not a duplicate.

- [ ] **Step 4: Dogfood the "no JIRA, declines to paste" stop-cleanly case**

Dispatch a subagent (Agent tool, general-purpose):

```
Follow the instructions in D:\Workspace\Jazurite\DigiSmith\skills\jira-intake\SKILL.md
exactly, operating on D:\Workspace\Jazurite\DigiSmith\. This is Door 1.
The user gives a ticket key, EMKT-8800, but no JIRA tool exists in this
session, and when asked to paste the ticket content instead, the user
declines ("I don't have it handy right now"). Per the skill's Error
Handling, this should stop cleanly — explaining jira-intake needs either
a JIRA tool or pasted content — and must NOT fabricate a ticket.md.
Report exactly what it did, and confirm no file was written.
```

Expected: report shows a clean stop with the "needs either a JIRA tool or
pasted content" explanation, and confirms no `docs/*/ticket.md` was
created for this run.

```bash
git status docs/
```

Expected: no new untracked `docs/` folder from this step.

- [ ] **Step 5: Dogfood the sparse-paste case**

Dispatch a subagent (Agent tool, general-purpose):

```
Follow the instructions in D:\Workspace\Jazurite\DigiSmith\skills\jira-intake\SKILL.md
exactly, operating on D:\Workspace\Jazurite\DigiSmith\. This is Door 1.
The user gives ticket key EMKT-8801, no JIRA tool exists, and when asked
to paste the ticket content, the user pastes only: "EMKT-8801". Per the
skill's Error Handling, this is too sparse to extract a title/description
— it should say so and offer either a cleaner paste or switching to Door
2, and must NOT fabricate a title/description or write a file. Report
exactly what it did and confirm no file was written.
```

Expected: report shows it flagged the paste as too sparse and offered a
cleaner paste or Door 2, with no fabricated ticket.md written.

- [ ] **Step 6: Clean up any dogfood artifacts left under `docs/`**

```bash
ls docs/
git status docs/
```

Delete any `docs/<slug>/` folders Steps 1-3 created (Steps 4-5 shouldn't
have created any). None of this is meant to be committed.

```bash
rm -rf docs/fix-cart-drawer-padding-mobile docs/fix-cart-drawer-padding-mobile-emkt-9099 docs/add-a-wishlist-icon-to-product
# adjust the exact slug names above to whatever the dogfood runs actually
# reported, then re-run git status docs/ to confirm nothing is left
```

- [ ] **Step 7: If any dogfood run in Steps 1-5 surfaced a real gap, fix it now**

If every report above matched its expected outcome, skip this step — no
code changes needed. If any subagent's behavior diverged from the
Handling Existing Files table or Error Handling section (e.g. it
overwrote silently, or asked a collision question on an upgrade), that is
a bug in `skills/jira-intake/SKILL.md`'s wording, not the test scenario —
fix the skill content directly, then re-run the specific dogfood step
that failed to confirm the fix.

- [ ] **Step 8: Commit**

```bash
git add skills/jira-intake/SKILL.md
git commit -m "test(intake): verify jira-intake edge cases (refresh, collision, upgrade, stop-cleanly, sparse-paste)"
```

If Step 7 made no changes, this commit will be empty — in that case skip
committing and instead note in your final report that all five edge
cases passed on the first pass with no skill changes needed.

---

### Task 3: Update `docs/history.html` for Map Item A

**Files:**
- Modify: `docs/history.html`

**Interfaces:**
- Consumes: nothing structural — this is a documentation update reflecting
  Tasks 1-2's completed work.
- Produces: an up-to-date living tracker, matching the convention
  established when G shipped.

- [ ] **Step 1: Update the map/build-order/timeline sections**

Open `docs/history.html` and, matching its existing structure and visual
style exactly (same CSS classes and section layout used for G's entry):
- In the map table, mark **A** as done, with a one-line note ("Two-door
  ticket intake — `jira-intake` skill") and a link/reference to
  `docs/superpowers/specs/2026-08-06-jira-intake-design.html`.
- In the build-order table, mark Tier 3's **A** as done (Tier 3 stays
  in-progress overall since **J** — estimation — is still outstanding).
- Add a timeline entry for this build: spec written 2026-08-06, plan
  written and executed 2026-08-07 (or the actual date this task runs),
  noting the reprioritization ahead of E and the resolution of the "A and
  L may be one skill" open question in MEMORY.md.
- Update the Progress Overview stat tiles to reflect the new count of
  shipped map items.

- [ ] **Step 2: Commit**

```bash
git add docs/history.html
git commit -m "docs: update history — jira-intake (A) shipped"
```
