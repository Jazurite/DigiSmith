# Using DigiSmith (E, First Slice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `using-digismith` — DigiSmith's map item **E**, first slice —
so that once a real ticket exists, the correctly-named implementation
branch gets created and the session hands off into
`superpowers:brainstorming` without starting cold.

**Architecture:** A single skill, `skills/using-digismith/SKILL.md`, three
steps: get a real ticket (invoking `digismith:jira-intake` if needed),
derive and create the ticket's branch as an isolated worktree, then invoke
`superpowers:brainstorming` from inside it with the ticket's content as
seed context. Nothing past that point is re-implemented — brainstorming
and writing-plans already declare their own terminal-step chains.

**Tech Stack:** Claude Code Skills (`SKILL.md`, YAML frontmatter), no
application code, no test framework — an instruction file, same as every
other DigiSmith skill so far.

## Global Constraints

- Skill frontmatter requires `name` and `description`; description starts
  with "Use when…", third person, states triggering conditions only —
  never a workflow summary (per `superpowers:writing-skills`'s Skill
  Discovery Optimization rules — this is the same rule Task 1 of the
  jira-intake plan got wrong the first time; don't repeat that).
- Branch name: `<ticket.md's Key field>__<slug>` — e.g.
  `EMKT-9001__fix-cart-drawer-padding-mobile`. Use the ticket's actual Key
  verbatim, never a hardcoded `EMKT-` prefix.
- Slug: reuse `digismith:jira-intake`'s own slug-derivation algorithm
  (lowercase, drop filler words, hyphenate, truncate to ~40 chars at a
  word boundary) — don't re-derive independently. In practice this means
  reusing the folder name `jira-intake` already wrote `ticket.md` into,
  since that folder name already *is* the slug.
- `using-digismith` never modifies `digismith:jira-intake` — it calls it,
  unchanged, as Step 1 when no ticket exists yet in the conversation.
- A ticket with no `**Key:**` set (an un-upgraded Door 2 draft) stops the
  skill before any branch or worktree is created — see the skill's Error
  Handling section.
- Worktree creation: prefer a native worktree tool if the session has one;
  fall back to `superpowers:using-git-worktrees` otherwise. Before
  creating anything, check whether a worktree for the exact target branch
  name already exists — reuse it rather than duplicating. If the branch
  name exists but belongs to a different, unrelated ticket, ask before
  proceeding rather than silently reusing it.
- `using-digismith` does not re-invoke or duplicate `brainstorming`'s or
  `writing-plans`'s own terminal-step chaining (brainstorming →
  writing-plans; writing-plans → subagent-driven-development/executing-plans).
  Its own job stops at invoking `superpowers:brainstorming` with the
  ticket's content as seed context.
- No automated test suite for `SKILL.md` files. Verification is a
  dogfooding pass: dispatch a subagent with the skill's content as its
  instructions and a concrete scenario.
- **Bounded dogfood testing for Step 3 (the brainstorming hand-off):** a
  dogfood subagent must NOT actually complete a live, multi-turn
  `superpowers:brainstorming` session — that skill's own hard gates need a
  real human across multiple turns, the same reason `AskUserQuestion`-gated
  flows couldn't be fully dogfooded end-to-end in the jira-intake plan.
  Instead, verification stops at: (a) the branch/worktree was actually
  created (real, checkable git state), and (b) the subagent correctly
  identifies that it would now invoke `superpowers:brainstorming` and
  reports the exact content it would pass as seed context — without
  actually issuing that `Skill` tool call.
- Dogfood-run branches/worktrees created against this repo (DigiSmith
  itself, standing in as "the repo currently being worked in" for test
  purposes) are test scaffolding — remove the worktree and delete the
  branch before each task's commit, same convention as jira-intake's
  `docs/<slug>/` cleanup.
- Cross-skill references inside `SKILL.md` content must be plugin-qualified:
  `digismith:jira-intake`, `superpowers:brainstorming`,
  `superpowers:using-git-worktrees`.

---

### Task 1: `using-digismith` Skill — Happy Path

**Files:**
- Create: `skills/using-digismith/SKILL.md`

**Interfaces:**
- Consumes: `digismith:jira-intake`'s output shape — a `docs/<slug>/ticket.md`
  file with `# <Title>`, optional `**Key:**`, `**Story Points:**`,
  `## Description`, `## Acceptance Criteria` sections (unchanged from the
  jira-intake plan's Ticket Template).
- Produces: an isolated worktree on a `<Key>__<slug>` branch, and a
  constructed (but, per Global Constraints, not live-executed in dogfood
  testing) `superpowers:brainstorming` invocation carrying the ticket's
  content.

This task writes the full skill and verifies the two straight-line happy
paths: a ticket that already exists this session, and a ticket that needs
`jira-intake` invoked first. Task 2 covers the edge cases (key-less draft,
worktree reuse, branch collision).

- [ ] **Step 1: Write `skills/using-digismith/SKILL.md`**

```markdown
---
name: using-digismith
description: Use when the user wants to start real implementation work on a ticket — phrases like "start work on this ticket", "begin implementation", "let's build this now". If they only want the ticket itself, with no branch or pipeline yet, use digismith:jira-intake directly instead.
---

# Using DigiSmith

## Overview

DigiSmith's map item **E**, first slice. Not the full future spine —
just the narrow gap between "I have a ticket" and "I'm building it":
get a real ticket, create its branch, hand off to
`superpowers:brainstorming`. Everything after that (writing-plans,
subagent-driven-development) already chains automatically through
Superpowers' own terminal steps — this skill does not re-invoke or
duplicate that chain.

## When to Use

The user wants to move from having a ticket to actually building it —
"start work on X", "begin implementation", "let's build this". If they
just want the ticket captured with no branch/pipeline yet, use
`digismith:jira-intake` directly instead.

## Process

### Step 1: Get a Real Ticket

Check whether this conversation already produced a `docs/<slug>/ticket.md`
via `digismith:jira-intake` earlier this session. If not, invoke
`digismith:jira-intake` now.

If the result has no `**Key:**` line set — it's a Door 2 draft that was
never upgraded to a real ticket — stop here. See Error Handling. Do not
create a branch or worktree for a key-less ticket.

### Step 2: Create the Branch

1. Derive the slug: reuse the folder name `ticket.md` is already sitting
   in (`docs/<slug>/ticket.md`) — that folder name already is the correct
   slug, produced by `jira-intake`'s own deterministic slug algorithm.
   Never re-derive the slug independently from the title.
2. Branch name: `<Key>__<slug>` — e.g.
   `EMKT-9001__fix-cart-drawer-padding-mobile`, using the ticket's actual
   `**Key:**` value verbatim (not a hardcoded `EMKT-` prefix).
3. Check whether a worktree already exists for this exact branch name
   (e.g. you're resuming a ticket started in an earlier session). If so,
   switch into it — do not create a duplicate. Continue to Step 3.
4. Check whether this exact branch name exists but belongs to a
   different, unrelated ticket (a collision at the git-branch level,
   distinct from `jira-intake`'s own docs-folder collision check). If so,
   ask via `AskUserQuestion` before proceeding — never silently reuse a
   stranger's branch.
5. Otherwise, create the isolated worktree with this branch name: prefer
   a native worktree tool if this session has one (it owns placement,
   branching, and cleanup); fall back to
   `superpowers:using-git-worktrees` otherwise.

### Step 3: Hand Off to Brainstorming

From inside that worktree, invoke `superpowers:brainstorming`, passing
`ticket.md`'s full content — title, description, acceptance criteria —
as seed context so brainstorming doesn't start cold. Once invoked,
`using-digismith`'s own job is done. Brainstorming's own process
(including its own user-approval gates) and its terminal-step chain into
`writing-plans` and `subagent-driven-development`/`executing-plans` take
over unmodified — do not re-invoke or duplicate any part of that chain
yourself.

## Error Handling

- **No real key** (a Door 2 draft, never upgraded to a real ticket) →
  stop after intake. Explain that `using-digismith` needs a real ticket
  key to name a branch; the user can continue manually, or run Door 1
  later once the ticket is real. Don't create a branch or worktree.
- **Existing worktree for this ticket** → switch into it, don't create a
  duplicate.
- **`jira-intake`'s own stop conditions** (no JIRA tool and the user
  declines to paste, pasted content too sparse, etc.) → don't proceed
  past whatever `jira-intake` itself decided; this isn't a new failure
  mode to reinvent.
- **Branch name collision with an unrelated ticket** → ask before
  proceeding via `AskUserQuestion`, never silently reuse.

## Quick Reference

| Step | Action |
|---|---|
| 1 | Get a real ticket (invoke `digismith:jira-intake` if needed); stop if key-less |
| 2 | Derive `<Key>__<slug>` branch name, reuse existing worktree or create one, ask on collision |
| 3 | Invoke `superpowers:brainstorming` with the ticket's content as seed context; Superpowers' own chain takes over from there |
```

- [ ] **Step 2: Dogfood the happy path — ticket already exists this session**

Create a fixture ticket first:

```bash
mkdir -p docs/fix-cart-drawer-padding-mobile
cat > docs/fix-cart-drawer-padding-mobile/ticket.md << 'EOF'
# Fix cart drawer padding on mobile checkout

**Key:** EMKT-9001
**URL:** https://jazurite.atlassian.net/browse/EMKT-9001
**Story Points:** 3

## Description

On mobile viewports, the cart drawer has 4px extra padding at the bottom
that misaligns with the checkout button. Should match desktop padding
value.

## Acceptance Criteria

- Cart drawer bottom padding matches desktop (16px)
- Verified on iOS Safari and Android Chrome
- No visual regression on tablet breakpoint
EOF
```

Dispatch a subagent (Agent tool, general-purpose) with this prompt:

```
Follow the instructions in D:\Workspace\Jazurite\DigiSmith\skills\using-digismith\SKILL.md
exactly, operating on D:\Workspace\Jazurite\DigiSmith\ as "the repo
currently being worked in" (this is a dogfood test — DigiSmith's own repo
is standing in as the target repo, not because tickets normally live
here). A ticket already exists this session at
docs/fix-cart-drawer-padding-mobile/ticket.md (Key EMKT-9001). Per the
skill: derive the branch name, create the isolated worktree (use a native
worktree tool if available), then — per this dogfood test's bounds — do
NOT actually invoke superpowers:brainstorming. Instead, report the exact
content you would pass to it as seed context. Report: the branch name
used, confirmation the worktree was created (and how — native tool or
using-git-worktrees fallback), and the seed context you would hand to
brainstorming.
```

Expected: branch name `EMKT-9001__fix-cart-drawer-padding-mobile`, a real
worktree created (verify independently — see Step 3 below), and reported
seed context containing the ticket's title, description, and acceptance
criteria verbatim.

- [ ] **Step 3: Verify Step 2's worktree independently, then clean up**

```bash
git worktree list
git branch --list "EMKT-9001__*"
```

Expected: both show the branch/worktree the subagent reported. Then clean
up — this was a dogfood run, not real feature work:

```bash
git worktree remove --force <path-reported-by-subagent>
git branch -D EMKT-9001__fix-cart-drawer-padding-mobile
git worktree prune
rm -rf docs/fix-cart-drawer-padding-mobile
git status
```

Expected: clean working tree, no leftover worktrees or branches from this
test.

- [ ] **Step 4: Dogfood "no ticket yet" — jira-intake triggered first**

Dispatch a subagent (Agent tool, general-purpose) with this prompt:

```
Follow the instructions in D:\Workspace\Jazurite\DigiSmith\skills\using-digismith\SKILL.md
exactly, operating on D:\Workspace\Jazurite\DigiSmith\ as "the repo
currently being worked in" (dogfood test, same caveat as before — this
repo is standing in as the target). No ticket exists yet this session.
The user says: "Start work on this — I have ticket EMKT-9200, here's the
content", then pastes:

  Key: EMKT-9200
  Title: Add lazy-loading to product grid images
  Story Points: 5
  Description: Product grid images should lazy-load below the fold to
  improve LCP on collection pages.
  Acceptance Criteria:
  - Images below the fold use loading="lazy"
  - LCP improves by at least 200ms on the collection page benchmark
  - No layout shift introduced

Per Step 1 of the skill, this should trigger digismith:jira-intake first
(Door 1, pasted content — you'll need to follow jira-intake's own
SKILL.md at D:\Workspace\Jazurite\DigiSmith\skills\jira-intake\SKILL.md
too, to produce the ticket.md). Once the real ticket exists, continue
through Steps 2-3 of using-digismith: create the branch/worktree, then —
per this dogfood test's bounds — report the seed context you would pass
to brainstorming rather than actually invoking it. Report: that
jira-intake was triggered first, the resulting ticket.md path, the branch
name used, worktree creation confirmation, and the seed context reported.
```

Expected: report confirms `jira-intake` ran first and produced
`docs/add-lazy-loading-product-grid-images/ticket.md` (or a similarly
derived slug — accept whatever `jira-intake`'s own deterministic algorithm
actually produces) with Key `EMKT-9200`, then `using-digismith` continued
to create branch `EMKT-9200__<that-same-slug>`.

- [ ] **Step 5: Verify Step 4's output independently, then clean up**

```bash
git worktree list
git branch --list "EMKT-9200__*"
```

Expected: matches the reported branch name. Clean up the same way as Step
3 (adjust the exact slug/path to whatever Step 4 actually reported):

```bash
git worktree remove --force <path-reported-by-subagent>
git branch -D <branch-name-reported-by-subagent>
git worktree prune
rm -rf docs/<slug-reported-by-subagent>
git status
```

Expected: clean working tree.

- [ ] **Step 6: Commit**

```bash
git add skills/using-digismith/SKILL.md
git commit -m "feat(spine): add using-digismith skill (E, first slice), happy path"
```

---

### Task 2: `using-digismith` Edge Cases

**Files:**
- Modify: `skills/using-digismith/SKILL.md` (only if a dogfood run below
  surfaces a real gap — no changes are expected if Task 1's content is
  correct)

**Interfaces:**
- Consumes: `skills/using-digismith/SKILL.md` from Task 1, unchanged
  unless a gap is found.
- Produces: nothing new downstream — this task verifies the three
  remaining spec-required scenarios not covered in Task 1.

- [ ] **Step 1: Dogfood the key-less draft stop**

Create a fixture Door 2 draft (no Key):

```bash
mkdir -p docs/add-wishlist-icon-product-cards
cat > docs/add-wishlist-icon-product-cards/ticket.md << 'EOF'
# Add wishlist icon to product cards

**Story Points:** TBD

## Description

Add a wishlist icon to product cards on the collection grid.

## Acceptance Criteria

- Icon toggles filled/outline on click
- Wishlist state persists in localStorage
- Icon has an accessible label
EOF
```

Dispatch a subagent (Agent tool, general-purpose):

```
Follow the instructions in D:\Workspace\Jazurite\DigiSmith\skills\using-digismith\SKILL.md
exactly, operating on D:\Workspace\Jazurite\DigiSmith\ (dogfood test). A
ticket already exists this session at
docs/add-wishlist-icon-product-cards/ticket.md — it has NO Key line set
(a Door 2 draft never upgraded). Per the skill's Error Handling, this
should stop here — no branch, no worktree created. Report exactly what
you did and confirm no branch/worktree was created.
```

Expected: report shows a clean stop citing the no-real-key rule, and
confirms no branch/worktree exists.

```bash
git worktree list
git branch --list "*wishlist*"
```

Expected: no matches. Clean up the fixture:

```bash
rm -rf docs/add-wishlist-icon-product-cards
```

- [ ] **Step 2: Dogfood worktree reuse — resuming an existing ticket**

```bash
mkdir -p docs/fix-cart-drawer-padding-mobile
cat > docs/fix-cart-drawer-padding-mobile/ticket.md << 'EOF'
# Fix cart drawer padding on mobile checkout

**Key:** EMKT-9001
**Story Points:** 3

## Description

Initial description.

## Acceptance Criteria

- Initial AC.
EOF
```

Dispatch a subagent (Agent tool, general-purpose):

```
Follow the instructions in D:\Workspace\Jazurite\DigiSmith\skills\using-digismith\SKILL.md
exactly, operating on D:\Workspace\Jazurite\DigiSmith\ (dogfood test).
First, create the branch/worktree for this ticket (docs/fix-cart-drawer-padding-mobile/ticket.md,
Key EMKT-9001) by running Steps 1-2 of the skill once (skip Step 3 — no
need to construct the brainstorming handoff yet). Then, simulating a
resumed session, run Steps 1-2 AGAIN for the exact same ticket. Per the
skill, the second run should detect the already-existing worktree for
branch EMKT-9001__fix-cart-drawer-padding-mobile and switch into it
rather than creating a duplicate. Report: did the second run detect and
reuse the existing worktree, or did it attempt to create a second one?
Confirm via `git worktree list` yourself before reporting.
```

Expected: report confirms exactly one worktree/branch exists after both
runs — reuse, not duplication.

```bash
git worktree list
git branch --list "EMKT-9001__*"
```

Expected: exactly one match. Clean up:

```bash
git worktree remove --force <path-reported-by-subagent>
git branch -D EMKT-9001__fix-cart-drawer-padding-mobile
git worktree prune
rm -rf docs/fix-cart-drawer-padding-mobile
```

- [ ] **Step 3: Dogfood branch-name collision with an unrelated ticket**

```bash
git branch EMKT-9001__fix-cart-drawer-padding-mobile
```

(This creates a plain branch with no associated worktree or ticket, standing in for "some unrelated branch that happens to collide.")

```bash
mkdir -p docs/fix-cart-drawer-padding-mobile
cat > docs/fix-cart-drawer-padding-mobile/ticket.md << 'EOF'
# Fix cart drawer padding on mobile checkout

**Key:** EMKT-9001
**Story Points:** 3

## Description

Unrelated description for the collision test.

## Acceptance Criteria

- Unrelated AC.
EOF
```

Dispatch a subagent (Agent tool, general-purpose):

```
Follow the instructions in D:\Workspace\Jazurite\DigiSmith\skills\using-digismith\SKILL.md
exactly, operating on D:\Workspace\Jazurite\DigiSmith\ (dogfood test). A
ticket exists at docs/fix-cart-drawer-padding-mobile/ticket.md, Key
EMKT-9001. Run Steps 1-2 of the skill. IMPORTANT: a branch named
EMKT-9001__fix-cart-drawer-padding-mobile already exists in this repo,
but it has NO associated worktree and is unrelated to this ticket (a
pre-existing collision, not a resumed session). Per the skill, this
should be detected as a collision and you should ask before proceeding —
do NOT silently create a worktree on top of this existing branch. Since
this is an unattended dogfood run and AskUserQuestion isn't available to
you, simply report that you detected the collision and would have asked,
rather than fabricating an answer and proceeding. Report what you found
and confirm you did not touch the existing branch.
```

Expected: report confirms collision detection and that no worktree was
force-created on the pre-existing branch.

```bash
git worktree list
```

Expected: no new worktree attached to `EMKT-9001__fix-cart-drawer-padding-mobile`.
Clean up:

```bash
git branch -D EMKT-9001__fix-cart-drawer-padding-mobile
rm -rf docs/fix-cart-drawer-padding-mobile
git worktree prune
git status
```

Expected: clean working tree.

- [ ] **Step 4: If any dogfood run in Steps 1-3 surfaced a real gap, fix it now**

If every report matched its expected outcome, skip this step. If any
subagent's behavior diverged from the skill's Error Handling section
(e.g. it created a branch for a key-less draft, or force-created a
worktree over a colliding branch), that's a bug in
`skills/using-digismith/SKILL.md`'s wording — fix it directly, then
re-run the specific dogfood step that failed to confirm the fix.

- [ ] **Step 5: Commit**

```bash
git add skills/using-digismith/SKILL.md
git commit -m "test(spine): verify using-digismith edge cases (key-less stop, worktree reuse, branch collision)"
```

If Step 4 made no changes, this commit will be empty — in that case skip
committing and instead note in your final report that all three edge
cases passed on the first pass with no skill changes needed.

---

### Task 3: Update `docs/history.html` for Map Item E (First Slice)

**Files:**
- Modify: `docs/history.html`

**Interfaces:**
- Consumes: nothing structural — documentation update reflecting Tasks
  1-2's completed work.
- Produces: an up-to-date living tracker.

E ships only a slice here, not its full future scope — the status
representation needs to make that partial state honest, not read as "E is
done."

- [ ] **Step 1: Update the map/build-order/timeline sections**

Open `docs/history.html` and, matching its existing structure and visual
style exactly:
- In the map table, **do not** mark row **E** as fully done — E's
  description in the map table already says "the prescriptive driver that
  enforces stage order and routes to everything else," and only a first
  slice (intake → branch → brainstorming hand-off) shipped. Use the same
  `status next` (in-progress) treatment already used elsewhere in this
  file for partially-shipped items, with a one-line note ("First slice
  shipped: intake → branch → brainstorming hand-off — `using-digismith`
  skill") and a reference to
  `docs/superpowers/specs/2026-08-07-using-digismith-design.html`.
- In the build-order table, Tier 1's Items cell currently reads
  `<strong>G</strong> standards injection <span class="status done">Done</span>
  · <strong>E</strong> spine` (G already has a done badge, added during
  jira-intake's final review). Add the same `status next` badge next to
  E for this partial-progress state, and update Tier 1's overall row
  status to reflect both items now having some progress.
- Add a timeline entry covering: spec written 2026-08-07, plan written
  and executed 2026-08-07 (or the actual date this task runs), noting
  this was pulled forward and deliberately scoped to one slice rather
  than E's full future role.
- The Progress Overview stat tiles' shipped-count logic currently counts
  fully-done map items — do not increment that count for E, since it is
  not fully done. If the file has no existing convention for tracking
  partial progress in that tile, leave the tile's logic alone and note in
  the timeline entry that E is in-progress, not shipped, so the two
  don't contradict each other.

- [ ] **Step 2: Commit**

```bash
git add docs/history.html
git commit -m "docs: update history — using-digismith (E, first slice) shipped"
```
