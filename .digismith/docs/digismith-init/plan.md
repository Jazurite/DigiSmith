# DigiSmith Init — Unified Entry Point Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `using-digismith` as the thing anyone invokes by name with a
single front door, `digismith:init`, that is safe to invoke regardless of
whether a ticket's work is starting fresh or already mid-stream — the way
`git init` is safe to run whether or not a repo already exists. `init`
dispatches to one of two internal-only workers: `digismith:bootstrap` (today's
`using-digismith`, renamed and no longer directly invoked) for a fresh ticket,
or the new `digismith:adopt` for a ticket whose spec and plan already exist
outside DigiSmith (an external ticket source, vanilla
`superpowers:brainstorming`/`superpowers:writing-plans`).

**Architecture:** Three skills. `digismith:init` holds only the
already-initialized check and the fresh-vs-mid-stream detection, then
dispatches. `digismith:bootstrap` is `using-digismith` renamed — its process
content is unchanged. `digismith:adopt` is new: it backfills profile/ticket/
branch state for already-existing work, relocates the existing spec/plan into
DigiSmith's docs convention (reusing `enforcer`'s own move-and-correct logic),
then hands off directly to `superpowers:subagent-driven-development` —
`brainstorming`/`writing-plans` are skipped since they already ran outside
DigiSmith.

**Tech Stack:** Claude Code Skills (`SKILL.md`, YAML frontmatter), no
application code, no test framework — instruction files, same as every other
DigiSmith skill so far.

**Spec:** [`.digismith/docs/digismith-init/design.html`](design.html) —
this plan implements that design; executors should read both.

## Global Constraints

- Skill frontmatter requires `name` and `description`; description states
  triggering conditions only, third person, never a workflow summary (per
  `superpowers:writing-skills`'s Skill Discovery Optimization rules).
  `bootstrap` and `adopt` are internal-only — their descriptions say so
  explicitly rather than reading as a normal user-facing trigger.
- `.digismith/profile` is DigiSmith's own equivalent of `.git/` for the
  already-initialized check: both `bootstrap` and `adopt` write it into the
  worktree as the last piece of state before handing off to the build: `init`
  checks for it before anything else runs.
- No renaming a branch that doesn't match `<Key>__<slug>`. Adopting a branch
  as-is, off-convention name and all, is correct — `capture-ephemeral-url`
  already degrades gracefully on a non-matching branch name (asks for the key
  directly), confirmed by reading its Error Handling section.
- `adopt` does not modify `digismith:jira-intake`, `digismith:bootstrap`, or
  `digismith:enforcer` — it calls into their exact existing logic by
  reference (matching this repo's own established idiom, e.g. how
  `using-digismith` already reused `jira-intake`'s slug algorithm rather than
  reimplementing it), never a second implementation of the same behavior.
- Neither `init` nor `adopt` invokes `superpowers:brainstorming` or
  `superpowers:writing-plans` — `adopt`'s whole premise is that both already
  ran outside DigiSmith for the ticket it's adopting.
- Cross-skill references inside `SKILL.md` content must be plugin-qualified:
  `digismith:jira-intake`, `digismith:bootstrap`, `digismith:adopt`,
  `digismith:enforcer`, `superpowers:brainstorming`,
  `superpowers:subagent-driven-development`.
- No automated test suite for `SKILL.md` files. Verification is a dogfooding
  pass: dispatch a subagent with the skill's content as its instructions and
  a concrete scenario, same convention as every prior DigiSmith plan.
- Dogfood-run branches/worktrees/fixture files created against this repo
  (DigiSmith itself, standing in as "the repo currently being worked in" for
  test purposes) are test scaffolding — remove the worktree, delete the
  branch, and delete fixture files before each task's commit.
- Commit messages: title only, `type(scope): summary`, no body, no AI
  references — per `standards/global/commit-style.md`.

---

### Task 1: Rename `using-digismith` → `bootstrap`, Internal-Only

**Files:**
- Create: `skills/bootstrap/SKILL.md` (moved content from
  `skills/using-digismith/SKILL.md`)
- Delete: `skills/using-digismith/SKILL.md`

**Interfaces:**
- Consumes: nothing new — this is the existing fresh-start process, unchanged
  in substance.
- Produces: `digismith:bootstrap`, callable by name, with the exact same
  Steps 0-3 behavior `using-digismith` already had. Later tasks (`init`,
  `adopt`) depend on this exact name and its Step 0 (profile resolution) and
  Step 2 (branch/worktree reuse) being callable by reference.

This is a mechanical rename plus a trigger-surface change (no longer directly
user-invoked) — no process-step content changes.

- [ ] **Step 1: Move the file and update its frontmatter**

```bash
git mv skills/using-digismith/SKILL.md skills/bootstrap/SKILL.md
```

Edit the frontmatter and title at the top of `skills/bootstrap/SKILL.md`:

```markdown
---
name: bootstrap
description: Invoked internally by digismith:init for fresh-start ticket work — never invoke directly. Gets a real ticket, creates its branch/worktree, and hands off to superpowers:brainstorming.
---

# Bootstrap (Fresh-Start Path)
```

- [ ] **Step 2: Update self-references inside the file**

Two spots reference the skill by its old name:

Find:
```markdown
This is `using-digismith`'s own job done at this point — don't fall through
into Step 1's ticket flow unless the user's original request was also to
start work.
```
Replace with:
```markdown
This is `bootstrap`'s own job done at this point — don't fall through into
Step 1's ticket flow unless the user's original request was also to start
work.
```

Find:
```markdown
`using-digismith` is done.
```
Replace with:
```markdown
`bootstrap` is done.
```

(Search the file for any other literal `using-digismith` occurrences missed
above and update them the same way — there should be none left when this step
is done. `grep -n using-digismith skills/bootstrap/SKILL.md` should return
nothing.)

- [ ] **Step 3: Remove the old user-facing "When to Use" framing**

Find:
```markdown
## When to Use

The user wants to move from having a ticket to actually building it —
"start work on X", "begin implementation", "let's build this". If they
just want the ticket captured with no branch/pipeline yet, use
`digismith:jira-intake` directly instead.
```
Replace with:
```markdown
## Invoked By

Only `digismith:init`, for the fresh-start case (see its Detection Logic).
Not directly matched against user phrasing — if you're reading this because
you want to start work on a ticket, invoke `digismith:init` instead.
```

- [ ] **Step 4: Verify no dangling references**

```bash
grep -rn "using-digismith" skills/bootstrap/SKILL.md
ls skills/using-digismith 2>&1 || echo "confirmed removed"
```

Expected: first command returns nothing; second confirms the old directory
is gone.

- [ ] **Step 5: Commit**

```bash
git add skills/bootstrap/SKILL.md
git commit -m "refactor(digismith-init): rename using-digismith to internal-only bootstrap"
```

---

### Task 2: `digismith:init` Skill — Already-Initialized Check & Fresh-Start Dispatch

**Files:**
- Create: `skills/init/SKILL.md`

**Interfaces:**
- Consumes: `digismith:bootstrap` (Task 1) — dispatched to for fresh-start and
  normal-resume detection outcomes.
- Produces: `digismith:init`, the skill either Jack or a future session
  invokes by name. This task covers Step 0 (already-initialized check) and
  Step 1's fresh-start/normal-resume rows (1-2); Task 4 wires up the
  mid-stream row (3-4) once `digismith:adopt` exists (Task 3).

- [ ] **Step 1: Write `skills/init/SKILL.md`**

```markdown
---
name: init
description: Use when the user wants to start or resume real implementation work on a ticket — phrases like "start work on this ticket", "begin implementation", "let's build this now", or mid-stream phrasing like "pick this up in DigiSmith" for work already begun outside DigiSmith. Safe to invoke regardless of whether this is a fresh ticket or one already mid-stream (spec/plan already written elsewhere) — detects which applies, the way `git init` is safe to run whether or not a repo already exists. If the user only wants a ticket captured, no branch or build yet, use digismith:jira-intake directly instead.
---

# Init

## Overview

DigiSmith's single front door for starting or resuming ticket work — map
item **E**, amended. Dispatches to one of two internal-only workers
depending on state:

- `digismith:bootstrap` — fresh start: profile → ticket → branch → hand off
  to `superpowers:brainstorming`. The original `using-digismith` process,
  renamed and no longer directly invoked.
- `digismith:adopt` — mid-stream: a ticket's spec and plan already exist
  outside DigiSmith. Backfills profile/ticket/branch state, relocates the
  existing docs into DigiSmith's convention, then hands off straight to the
  build stage.

Neither worker is directly user-invoked; `init` is the only thing either Jack
or a future session reaches for by name to start or resume ticket work.

## When to Use

"Start work on this ticket", "begin implementation", "let's build this now —
[paste ticket or describe the need]", or mid-stream phrasing like "pick this
up in DigiSmith" / "catch this ticket up to DigiSmith". If the user only
wants a ticket captured with no branch/build yet, use `digismith:jira-intake`
directly instead.

## Process

### Step 0: Already-Initialized Check

Check for `.digismith/profile` in the current working directory — the repo
or worktree currently being worked in, never DigiSmith's own repo unless
that is genuinely the repo being worked in.

**Present** → this worktree was already fully set up by DigiSmith, via
either `bootstrap` or `adopt`. Read its one-line content as `<name>` and
report plainly:

```
Already initialized for DigiSmith (profile: <name>, docs at
.digismith/docs/<slug>/).
```

Stop here — no re-running detection, no re-relocating docs, no further
questions. Same posture as `git init` on an existing repo: a notice, not a
cascade. (If the user's actual request was "switch this repo's profile to
X" rather than "start/resume work," that still routes to `bootstrap`'s
existing profile-switch handling — invoke `digismith:bootstrap` directly
for that specific request only, bypassing Step 1 below.)

**Absent** → continue to Step 1.

### Step 1: Detect Fresh-Start vs. Mid-Stream

Checked in order — stop and dispatch at the first match:

1. **Current branch is the repo's base branch.** Resolve it with
   `git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@'`;
   if that fails (no remote configured), fall back to checking whether the
   current branch is literally named `main` or `master`. Match → fresh
   start. Invoke `digismith:bootstrap`.
2. **Already on a feature branch, and `.digismith/docs/<slug>/plan.md`
   already exists** for the slug implied by the branch name (`<Key>__<slug>`
   or `<slug>` alone) → normal resume, already covered by `bootstrap`'s own
   branch/worktree reuse logic (its Step 2.3). Invoke `digismith:bootstrap`.
3. **Already on a feature branch, no `.digismith/docs/` for it, but a plan
   file exists somewhere** — check whether the conversation already named a
   plan path; if not, ask directly: "Is there a plan already written for
   this, and if so where?" before concluding none exists. A real answer here
   → mid-stream. Invoke `digismith:adopt`.
4. **On a feature branch, no plan found anywhere** (Step 3's question came
   back negative, or the named path doesn't exist) → ambiguous. Ask via
   `AskUserQuestion`:

```
I don't see any DigiSmith docs or plan file for this branch. Should I start
fresh (new spec/plan from here), or is there work already in progress I
should pick up?
```

Never guess between `bootstrap` and `adopt` when detection is ambiguous.

## Error Handling

- **`.digismith/profile` present** → see Step 0; always stops there except
  for an explicit profile-switch request, which routes straight to
  `bootstrap`.
- **Detection ambiguous** (Step 1, row 4) → ask via `AskUserQuestion`, never
  guess.
- **Past dispatch** → whichever of `bootstrap`/`adopt` was invoked owns its
  own error handling from that point on; `init`'s job is done once it
  dispatches.

## Quick Reference

| Step | Action |
|---|---|
| 0 | `.digismith/profile` present in cwd → report "already initialized" and stop (profile-switch request → `bootstrap` directly) |
| 1 | Base branch → `bootstrap`. Feature branch + `.digismith/docs/<slug>/plan.md` exists → `bootstrap`. Feature branch + plan exists elsewhere → `adopt`. Feature branch + no plan anywhere → ask, don't guess |
```

- [ ] **Step 2: Dogfood the already-initialized short-circuit**

```bash
mkdir -p .digismith
echo "digismith" > .digismith/profile
```

Dispatch a subagent (Agent tool, general-purpose):

```
Follow the instructions in D:\Workspace\Jazurite\DigiSmith\skills\init\SKILL.md
exactly, operating on D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\digismith-init\
as "the repo currently being worked in" (dogfood test — DigiSmith's own
worktree is standing in as the target). A file .digismith/profile already
exists there containing "digismith". Per the skill, this should stop at
Step 0 with an "already initialized" report — do not proceed to Step 1, do
not dispatch to bootstrap or adopt. Report exactly what you found and
confirm you stopped without dispatching further.
```

Expected: report confirms the already-initialized message and that neither
`bootstrap` nor `adopt` was invoked.

```bash
rm .digismith/profile
```

- [ ] **Step 3: Dogfood fresh-start detection (base branch, no profile)**

Confirm the current branch is this worktree's own base branch for the
purposes of this test (it is — `worktree-digismith-init` was branched fresh,
but Step 1's row 1 checks against *origin's* default branch, e.g. `main`, not
this worktree's own branch name; use a throwaway detached scenario instead so
the test doesn't depend on this worktree's real branch):

```bash
git worktree list
```

Dispatch a subagent (Agent tool, general-purpose):

```
Follow the instructions in D:\Workspace\Jazurite\DigiSmith\skills\init\SKILL.md
exactly. Assume you are operating in a repo whose current branch IS the
repo's base branch (main), and no .digismith/profile exists. Per Step 1, row
1, this should resolve to "fresh start" and you should report that you would
invoke digismith:bootstrap next — per this dogfood test's bounds, do NOT
actually invoke it, just report the detection outcome and which skill you'd
dispatch to.
```

Expected: report identifies "fresh start" and names `digismith:bootstrap` as
the dispatch target.

- [ ] **Step 4: Dogfood the ambiguous-detection ask**

Dispatch a subagent (Agent tool, general-purpose):

```
Follow the instructions in D:\Workspace\Jazurite\DigiSmith\skills\init\SKILL.md
exactly. Assume you are operating on a feature branch (not the base branch),
no .digismith/docs/ exists for its slug, and when you ask whether a plan
already exists somewhere, the answer is no. Per Step 1, row 4, this is
ambiguous. Report that you would ask via AskUserQuestion whether to start
fresh or adopt existing work, rather than guessing — and do not fabricate an
answer to that question yourself.
```

Expected: report confirms it would ask rather than silently picking
`bootstrap` or `adopt`.

- [ ] **Step 5: Commit**

```bash
git add skills/init/SKILL.md
git commit -m "feat(digismith-init): add init skill with already-initialized check and fresh-start dispatch"
```

---

### Task 3: `digismith:adopt` Skill — Mid-Stream Adoption

**Files:**
- Create: `skills/adopt/SKILL.md`

**Interfaces:**
- Consumes: `digismith:bootstrap` Step 0 (profile resolution) and Step 2.3
  (branch-exists-no-worktree reuse) by reference; `digismith:jira-intake`
  Door 1 by reference; `digismith:enforcer` Step 2/5 (move-and-correct doc
  relocation) by reference.
- Produces: `digismith:adopt`, invoked internally by `digismith:init` (wired
  up in Task 4) once mid-stream state is detected. Ends by invoking
  `superpowers:subagent-driven-development` against the relocated plan.

- [ ] **Step 1: Write `skills/adopt/SKILL.md`**

```markdown
---
name: adopt
description: Invoked internally by digismith:init when a ticket's spec and plan already exist outside DigiSmith (an external ticket source, vanilla superpowers:brainstorming/superpowers:writing-plans) — never invoke directly. Backfills DigiSmith's profile/ticket/branch state, relocates the existing docs into DigiSmith's convention, and hands off straight to the build stage.
---

# Adopt (Mid-Stream Path)

## Overview

Resolves the recurring friction behind `backlog/mid-development-workflow-injection.md`:
a ticket ID pulled through an external source (e.g. an Atlassian MCP
connector) plus a spec and plan already written by vanilla
`superpowers:brainstorming`/`superpowers:writing-plans`, with none of
DigiSmith's profile-scoped standards injection or docs convention ever having
kicked in. `adopt` backfills that state retroactively, then hands off to the
same build stage a fresh-start ticket would reach.

Scoped narrowly to one entry point: ticket known, spec written (optionally),
plan written, nothing built yet. Joining before a spec/plan exists, or
mid-build, is out of scope.

## Invoked By

Only `digismith:init`, once its Step 1 detects a feature branch with a plan
file that exists outside `.digismith/docs/`. Not directly matched against
user phrasing.

## Process

### Step 1: Confirm Inputs

Ask for whatever isn't already obvious from the conversation:

- The ticket key.
- Path to the existing plan file. **Required** — stop here if none can be
  found or supplied (see Error Handling).
- Path to the existing spec file, if one exists. **Optional** — some
  tickets go straight from a raw need to a hand-written plan with no formal
  spec step.

### Step 2: Resolve Profile

Run `digismith:bootstrap`'s Step 0 exactly, treating the repo currently
being worked in the same way `bootstrap` would. This resolves (or, on first
use in this repo, picks via the same `AskUserQuestion` flow) the active
profile and ensures `.digismith/profile` exists with the chosen name. The
resolved profile's `ticket`, `ephemeral`, `standards`, `reporting`,
`publish_artifact`, and `logging` fields are now available for the rest of
this process, exactly as they would be for `bootstrap`.

### Step 3: Get the Ticket and Resolve the Slug

**If the active profile's `ticket` field is `false`:** skip straight to
deriving the slug directly from a feature description (ask the user for one
if it isn't already obvious), applying `digismith:jira-intake` Step 3.1's
deterministic rule: lowercase, drop filler words (a, an, the, on, to, of,
for, in), replace remaining non-alphanumeric runs with a single hyphen,
truncate to ~40 characters at a word boundary. No `ticket.md` gets written.
Continue to Step 4.

**Otherwise:**

1. Invoke `digismith:jira-intake` Door 1, supplying the ticket key already
   confirmed in Step 1 directly — it does not need to ask for it again.
   `jira-intake` fetches the ticket (or asks you to paste it, per its own
   JIRA Detection) and writes `.digismith/docs/<its-own-derived-slug>/ticket.md`
   using its own Step 3.1 algorithm on the fetched title.
2. Check whether the current branch already matches `<Key>__<slug>`. If it
   does, and that slug differs from the slug `jira-intake` just derived, the
   branch's slug wins — it's already committed to the branch name, and
   `adopt` never renames a branch (see Global Constraints). Move
   `.digismith/docs/<jira-intake's-slug>/` to
   `.digismith/docs/<branch's-slug>/` in its entirety (same move-and-correct
   idiom `digismith:enforcer` already uses for a misplaced `design.html`/
   `plan.md` — applied here to a misplaced `ticket.md` folder).
3. If the branch doesn't match `<Key>__<slug>` at all (an off-convention
   name), there's nothing to compare against — use `jira-intake`'s derived
   slug directly, no correction needed.

Whichever slug results from this step is used for every step below —
never re-derived a third way.

### Step 4: Ensure an Isolated Worktree

Because `digismith:init` only dispatches here from a state where a feature
branch already exists (see its Detection Logic), there is always a branch
to work with — the only open question is whether it's already isolated in
its own worktree.

- **Already inside an isolated worktree for this branch** → nothing to do,
  continue to Step 5 from here.
- **On the branch directly in a non-isolated checkout** → attach a worktree
  to the existing branch: prefer a native worktree tool if this session has
  one; otherwise `git worktree add <path> <branch-name>` — no `-b`, the
  branch already exists. This mirrors `bootstrap` Step 2.3's
  branch-exists-no-worktree case exactly. Switch into it.

### Step 5: Write Config Into the Worktree

**Profile.** If Step 2 resolved/wrote `.digismith/profile` somewhere other
than the worktree Step 4 left you in (e.g. Step 4 just attached a new
worktree), copy the file in now: a plain file copy, never `git add`, never
`git add -f`, never a commit — mirrors `bootstrap` Step 2.6 exactly, same
reasoning (a worktree checks out only committed files).

**Telemetry marker.** First, unconditionally clear any marker left over from
a previous ticket in this same checkout, regardless of what the profile
says — same reasoning as `bootstrap` Step 1.5:

```bash
rm -f .digismith/telemetry-marker
```

Then, if the active profile's `logging` field is `true`, write a fresh
marker recording where telemetry capture should resume from — from this
`adopt` run forward, **not** from whenever the pre-existing spec/plan were
originally written outside DigiSmith (that earlier work happened before
DigiSmith was involved at all, so it's outside this capture's scope by
construction):

```bash
CWD_ENCODED=$(pwd | sed 's/[^a-zA-Z0-9]/-/g')
TRANSCRIPT_DIR="$HOME/.claude/projects/$CWD_ENCODED"
TRANSCRIPT=$(ls -t "$TRANSCRIPT_DIR"/*.jsonl 2>/dev/null | head -1)
```

If `$TRANSCRIPT` is empty, skip the rest of this step entirely — logging
silently does nothing rather than blocking adoption. Otherwise:

```bash
START_LINE=$(wc -l < "$TRANSCRIPT" | tr -d ' ')
REPO_NAME=$(basename "$(git rev-parse --show-toplevel)")
STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
mkdir -p .digismith
{
  echo "transcript: $TRANSCRIPT"
  echo "session_id: $(basename "$TRANSCRIPT" .jsonl)"
  echo "start_line: $START_LINE"
  echo "started_at: $STARTED_AT"
  echo "repo: $REPO_NAME"
  echo "slug: <slug from Step 3>"
} > .digismith/telemetry-marker
```

If Step 3 resolved a real ticket key, append it:

```bash
echo "ticket_key: <Key>" >> .digismith/telemetry-marker
```

If Step 4 attached a separate worktree after this marker was written, copy
it in the same way the profile file is copied above — mirrors `bootstrap`
Step 2.7.

### Step 6: Relocate the Docs

Run `digismith:enforcer`'s Step 2/5 "Verified" move-and-correct logic
directly, against the plan (and spec, if one was supplied) from Step 1,
targeting the slug resolved in Step 3:

- **Plan:** move the file from Step 1's supplied path to
  `.digismith/docs/<slug>/plan.md`, creating the folder if needed. Format
  doesn't change — plans are already Markdown.
- **Spec, if supplied:** rewrap its content into `enforcer`'s HTML shell at
  `.digismith/docs/<slug>/design.html` (reuse the shell byte-for-byte from
  `enforcer`'s Step 1), respecting the same gitignore check
  (`git check-ignore -q .digismith/docs/<slug>/design.html`) and
  `publish_artifact` gate `enforcer` Step 3 already defines. No spec
  supplied → skip `design.html` entirely, not an error.
- **Relocation target already exists with different content** (e.g. a
  previous partial `adopt` run, or a genuine naming collision) → ask before
  overwriting, same "never silently overwrite" posture used everywhere else
  in this project.

### Step 7: Hand Off to Build

Invoke `superpowers:subagent-driven-development` directly against
`.digismith/docs/<slug>/plan.md` — `superpowers:brainstorming` and
`superpowers:writing-plans` already ran outside DigiSmith for this ticket,
so they are not invoked here. From this point on,
`digismith:subagent-driven-always` and `digismith:inject-standards`
Scenario 4 apply exactly as they would for any other
`subagent-driven-development` dispatch — no special-casing needed, since
both trigger off the dispatch itself, not off which entry point produced it.

## Error Handling

- **No plan file found or supplied** → stop, explain a plan file is required
  for this path; don't fabricate one or silently fall back to `bootstrap`.
- **Active profile has `ticket: false`** → skip `jira-intake`/`ticket.md`
  entirely (Step 3); `adopt` isn't ticket-mandatory just because the
  recurring case usually has one.
- **`jira-intake`'s own stop conditions** (no JIRA tool and the user declines
  to paste, sparse paste, existing-file collision, etc.) → `adopt` doesn't
  proceed past whatever `jira-intake` itself decided; not a new failure mode
  to reinvent.
- **No spec supplied, only a plan** → not an error (Step 6) — proceed with
  the plan alone.
- **Relocation target already has different content** → ask before
  overwriting (Step 6), never silently clobber.
- **Logging on but no transcript directory/file found** → skip the marker
  *write* half of Step 5 silently, same disposition as `bootstrap` Step 1.5;
  never block adoption over this.

## Quick Reference

| Step | Action |
|---|---|
| 1 | Confirm ticket key, plan path (required), spec path (optional) |
| 2 | Resolve profile — run `bootstrap` Step 0 exactly |
| 3 | Get the ticket via `jira-intake` (skip if `ticket: false`), resolve the slug — branch's own slug wins over `jira-intake`'s derived one if they differ, moving the ticket.md folder to match |
| 4 | Ensure an isolated worktree — already in one, or attach one to the existing branch (`bootstrap` Step 2.3's logic, no `-b`) |
| 5 | Copy `.digismith/profile` in if needed; unconditionally clear then (if `logging: true`) write and copy in a fresh telemetry marker |
| 6 | Relocate plan (required) and spec (optional) into `.digismith/docs/<slug>/` via `enforcer`'s move-and-correct logic |
| 7 | Invoke `superpowers:subagent-driven-development` directly against the relocated `plan.md` |
```

- [ ] **Step 2: Dogfood the mid-stream happy path — plan and spec supplied**

Create fixtures standing in for "vanilla Superpowers already wrote these":

```bash
mkdir -p docs/superpowers/specs docs/superpowers/plans
cat > docs/superpowers/specs/2026-08-16-adopt-fixture-design.md << 'EOF'
# Adopt Fixture Feature — Design

## Problem
A fixture spec for dogfooding the adopt skill.

## Approach
Do the fixture thing.
EOF
cat > docs/superpowers/plans/2026-08-16-adopt-fixture.md << 'EOF'
# Adopt Fixture Implementation Plan

**Goal:** Prove adopt relocates a plan correctly.

### Task 1: Fixture Task

- [ ] **Step 1: Do the fixture thing**

```bash
echo fixture
```
EOF
git worktree list
```

Dispatch a subagent (Agent tool, general-purpose):

```
Follow the instructions in D:\Workspace\Jazurite\DigiSmith\skills\adopt\SKILL.md
exactly, operating on D:\Workspace\Jazurite\DigiSmith\ as "the repo currently
being worked in" (dogfood test). Ticket key: EMKT-9300. Plan file:
docs/superpowers/plans/2026-08-16-adopt-fixture.md. Spec file:
docs/superpowers/specs/2026-08-16-adopt-fixture-design.md. Assume the active
profile is "digismith" (ticket: false, so per Step 3 skip jira-intake
entirely and derive the slug directly from the feature description "Adopt
Fixture Feature"). Assume you are already on a feature branch (not the base
branch) but NOT yet inside an isolated worktree for it — per Step 4, attach
one. Run through Steps 2-6 for real (profile resolution, worktree
attachment, doc relocation) but per this dogfood test's bounds, do NOT
actually invoke superpowers:subagent-driven-development in Step 7 — instead
report the exact plan.md path you would invoke it against. Report: the
resolved slug, the worktree path used, and confirmation that both
.digismith/docs/<slug>/design.html and .digismith/docs/<slug>/plan.md were
written correctly (report their content).
```

Expected: report confirms slug `adopt-fixture-feature` (or an equivalent
deterministic derivation from the title), a worktree was attached, and both
`.digismith/docs/adopt-fixture-feature/design.html` (HTML-shell-wrapped) and
`.digismith/docs/adopt-fixture-feature/plan.md` (moved as-is) exist with the
fixture content.

- [ ] **Step 3: Verify Step 2's output independently, then clean up**

```bash
find .digismith/docs -iname "*adopt-fixture*"
git worktree list
```

Expected: both files exist at the reported location; a worktree matching the
report exists. Clean up — this was a dogfood run, not real feature work:

```bash
git worktree remove --force <path-reported-by-subagent>
git branch -D <branch-name-reported-by-subagent>
git worktree prune
rm -rf docs/superpowers/specs/2026-08-16-adopt-fixture-design.md \
       docs/superpowers/plans/2026-08-16-adopt-fixture.md \
       .digismith/docs/adopt-fixture-feature
git status
```

Expected: clean working tree, no leftover worktrees, branches, or fixture
docs.

- [ ] **Step 4: Dogfood plan-only adoption (no spec)**

```bash
mkdir -p docs/superpowers/plans
cat > docs/superpowers/plans/2026-08-16-adopt-fixture-noSpec.md << 'EOF'
# Adopt Fixture (No Spec) Implementation Plan

**Goal:** Prove adopt handles a plan with no accompanying spec.

### Task 1: Fixture Task

- [ ] **Step 1: Do the fixture thing**

```bash
echo fixture
```
EOF
```

Dispatch a subagent (Agent tool, general-purpose):

```
Follow the instructions in D:\Workspace\Jazurite\DigiSmith\skills\adopt\SKILL.md
exactly, operating on D:\Workspace\Jazurite\DigiSmith\ (dogfood test).
Ticket key: EMKT-9301. Plan file:
docs/superpowers/plans/2026-08-16-adopt-fixture-noSpec.md. No spec file
exists. Assume the active profile is "digismith" (ticket: false — derive
the slug from "Adopt Fixture No Spec Feature"). Assume a feature branch
already exists and you are already inside its isolated worktree (Step 4 has
nothing to do). Run Steps 2-6 for real; per this dogfood test's bounds, do
NOT invoke superpowers:subagent-driven-development in Step 7 — report the
plan.md path instead. Report: confirmation that no design.html was created
(none was supplied), and that plan.md was relocated correctly.
```

Expected: report confirms `design.html` was correctly skipped (not an error)
and `plan.md` landed at the resolved slug's convention path.

```bash
find .digismith/docs -iname "*adopt-fixture-no-spec*"
```

Expected: only a `plan.md` exists, no `design.html`. Clean up:

```bash
rm -rf docs/superpowers/plans/2026-08-16-adopt-fixture-noSpec.md \
       .digismith/docs/adopt-fixture-no-spec-feature
git status
```

Expected: clean working tree.

- [ ] **Step 5: Dogfood `ticket: true` — jira-intake fetch, branch-slug conflict, no rename**

This exercises the path Jack's actual recurring case hits: a real ticket
key fetched through `jira-intake`, an already-existing branch whose slug
differs from what `jira-intake` would derive from the ticket title, and
confirmation the branch itself is never renamed to match.

```bash
mkdir -p docs/superpowers/plans
cat > docs/superpowers/plans/2026-08-16-adopt-slug-conflict-fixture.md << 'EOF'
# Adopt Slug Conflict Fixture Implementation Plan

**Goal:** Prove adopt resolves a branch-slug vs. jira-intake-derived-slug conflict correctly.

### Task 1: Fixture Task

- [ ] **Step 1: Do the fixture thing**

```bash
echo fixture
```
EOF
git branch EMKT-9400__old-slug-name
```

Dispatch a subagent (Agent tool, general-purpose):

```
Follow the instructions in D:\Workspace\Jazurite\DigiSmith\skills\adopt\SKILL.md
exactly, operating on D:\Workspace\Jazurite\DigiSmith\ (dogfood test).
Ticket key: EMKT-9400. Plan file:
docs/superpowers/plans/2026-08-16-adopt-slug-conflict-fixture.md. No spec
file. Assume the active profile has ticket: true (like "emma"). No JIRA
tool is available in this session, so per jira-intake's own JIRA Detection,
it asks for pasted content — supply this pasted ticket content yourself as
if you were the user responding:

  Key: EMKT-9400
  Title: Add sticky filter bar to collection pages
  Story Points: 5
  Description: The filter bar should stick to the top of the viewport when
  scrolling collection pages.
  Acceptance Criteria:
  - Filter bar sticks on scroll past the hero
  - No layout shift introduced
  - Works on mobile and desktop breakpoints

A branch named EMKT-9400__old-slug-name already exists (checked out, not
yet in an isolated worktree) — deliberately a DIFFERENT slug than what
jira-intake would derive from this title. Per Step 3, the branch's own
slug wins: after jira-intake writes ticket.md at its own derived slug, move
that folder to match the branch's actual slug (old-slug-name) instead. Per
Step 4, attach an isolated worktree to the existing branch (no -b). Run
through the rest of adopt for real (Steps 4-6); per this dogfood test's
bounds, do NOT invoke superpowers:subagent-driven-development in Step 7 —
report the plan.md path instead. Report: which slug jira-intake initially
derived, that it was moved to "old-slug-name" to match the branch, the
worktree path used, and confirmation the branch itself was NOT renamed.
```

Expected: report confirms `jira-intake` derived some slug from the title,
that slug's folder was moved to `.digismith/docs/old-slug-name/`, a
worktree was attached to the pre-existing `EMKT-9400__old-slug-name` branch
without renaming it, and both `ticket.md` and `plan.md` ended up under
`.digismith/docs/old-slug-name/`.

```bash
find .digismith/docs -iname "*old-slug-name*"
git branch --list "EMKT-9400__*"
git worktree list
```

Expected: files exist at `old-slug-name`, not at whatever jira-intake's
title-derived slug would have been; the branch name is unchanged
(`EMKT-9400__old-slug-name`, not renamed). Clean up:

```bash
git worktree remove --force <path-reported-by-subagent>
git branch -D EMKT-9400__old-slug-name
git worktree prune
rm -rf docs/superpowers/plans/2026-08-16-adopt-slug-conflict-fixture.md \
       .digismith/docs/old-slug-name
git status
```

Expected: clean working tree.

A branch with no `<Key>__<slug>` pattern at all (e.g. `feature/sticky-bar`)
takes the simpler sub-path of the same Step 3 logic — nothing to compare,
`jira-intake`'s derived slug is used directly. That's a strict subset of
the comparison-and-move logic just verified above (skip the move, keep
everything else identical), so it doesn't need its own separate dogfood
run; re-verify it only if Step 6 below surfaces a reason to.

- [ ] **Step 6: Commit**

```bash
git add skills/adopt/SKILL.md
git commit -m "feat(digismith-init): add adopt skill for mid-stream ticket adoption"
```

---

### Task 4: Wire `init`'s Mid-Stream Row to `adopt`

**Files:**
- Modify: none expected — Task 2's `skills/init/SKILL.md` already names
  `digismith:adopt` in Step 1, rows 3-4. This task is the end-to-end
  dogfood confirming the dispatch actually works now that `adopt` exists
  (Task 3), not a content change.

**Interfaces:**
- Consumes: `skills/init/SKILL.md` (Task 2), `skills/adopt/SKILL.md`
  (Task 3), unchanged.
- Produces: confirmation that `init` correctly detects and dispatches the
  mid-stream case end-to-end.

- [ ] **Step 1: Dogfood the full mid-stream path through `init`**

```bash
mkdir -p docs/superpowers/plans
cat > docs/superpowers/plans/2026-08-16-init-e2e-fixture.md << 'EOF'
# Init End-to-End Fixture Implementation Plan

**Goal:** Prove init detects mid-stream state and dispatches to adopt.

### Task 1: Fixture Task

- [ ] **Step 1: Do the fixture thing**

```bash
echo fixture
```
EOF
```

Dispatch a subagent (Agent tool, general-purpose):

```
Follow the instructions in D:\Workspace\Jazurite\DigiSmith\skills\init\SKILL.md
exactly, operating on D:\Workspace\Jazurite\DigiSmith\ (dogfood test). No
.digismith/profile exists. Assume you are already on a feature branch (not
the base branch), no .digismith/docs/ exists for it, and when Step 1 row 3
asks whether a plan already exists, answer: yes, at
docs/superpowers/plans/2026-08-16-init-e2e-fixture.md. Per the skill this
should resolve to mid-stream and dispatch to digismith:adopt. Continue by
actually following digismith:adopt's own SKILL.md (at
D:\Workspace\Jazurite\DigiSmith\skills\adopt\SKILL.md) through its Steps 1-6
for real (ticket key EMKT-9302, profile "digismith" so ticket:false, no
spec) — but per this dogfood test's bounds, do NOT invoke
superpowers:subagent-driven-development in adopt's Step 7. Report: that init
correctly identified "mid-stream" and dispatched to adopt, and adopt's
resulting resolved slug and plan.md location.
```

Expected: report confirms `init` detected mid-stream (not fresh-start, not
ambiguous) and dispatched to `adopt`, and `adopt` completed through doc
relocation.

- [ ] **Step 2: Verify and clean up**

```bash
find .digismith/docs -iname "*init-e2e-fixture*"
git worktree list
```

Expected: matches the report. Clean up:

```bash
git worktree remove --force <path-reported-by-subagent> 2>/dev/null || true
git branch -D <branch-name-reported-by-subagent> 2>/dev/null || true
git worktree prune
rm -rf docs/superpowers/plans/2026-08-16-init-e2e-fixture.md \
       .digismith/docs/init-end-to-end-fixture-feature
git status
```

Expected: clean working tree.

- [ ] **Step 3: Commit**

Only if this step surfaced a real gap requiring a change to `init` or
`adopt` — otherwise this task's commit is empty; skip it and note in the
final report that the end-to-end dispatch passed with no changes needed.

```bash
git add skills/init/SKILL.md skills/adopt/SKILL.md
git commit -m "test(digismith-init): verify init dispatches mid-stream state to adopt"
```

---

### Task 5: Update Cross-Referencing Skills

**Files:**
- Modify: `skills/telemetry/SKILL.md`
- Modify: `skills/subagent-driven-always/SKILL.md`
- Modify: `skills/inject-standards/SKILL.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: no dangling references to the old `using-digismith` name
  anywhere in the active skill set (historical docs under
  `.digismith/docs/using-digismith/` are untouched — they're the permanent
  record of when that feature originally shipped).

- [ ] **Step 1: Update `skills/telemetry/SKILL.md`**

Find:
```markdown
when a repo's profile has `logging: true`, `digismith:using-digismith`
marks where a ticket's build began in the live session transcript, and
```
Replace with:
```markdown
when a repo's profile has `logging: true`, `digismith:bootstrap` or
`digismith:adopt` marks where a ticket's build began in the live session
transcript, and
```

Find:
```markdown
(`digismith:using-digismith` Step 1.5 omits it unless a real ticket key
was resolved)
```
Replace with:
```markdown
(`digismith:bootstrap` Step 1.5, or `digismith:adopt`'s equivalent step,
omits it unless a real ticket key was resolved)
```

Find:
```markdown
It is recorded separately from `transcript` on purpose: the recorded
absolute path is computed in the original checkout, *before*
`using-digismith` Step 2 enters a worktree, and Claude Code re-homes a
```
Replace with:
```markdown
It is recorded separately from `transcript` on purpose: the recorded
absolute path is computed in the original checkout, *before*
`bootstrap`/`adopt` enters or attaches a worktree, and Claude Code re-homes a
```

Find:
```markdown
**Resolve first — do not test the recorded path alone.** The path in the
marker was recorded before `using-digismith` entered a worktree, and the
```
Replace with:
```markdown
**Resolve first — do not test the recorded path alone.** The path in the
marker was recorded before `bootstrap`/`adopt` entered a worktree, and the
```

Find:
```markdown
if this same worktree is ever reused for unrelated work later. (The
original checkout's own copy is not this skill's problem:
`digismith:using-digismith` Step 1.5 unconditionally clears it at the
start of every run.)
```
Replace with:
```markdown
if this same worktree is ever reused for unrelated work later. (The
original checkout's own copy is not this skill's problem:
`digismith:bootstrap` Step 1.5 — and `digismith:adopt`'s equivalent step —
unconditionally clears it at the start of every run.)
```

Find:
```markdown
  `finishing-a-development-branch`'s own flow over this. A miss on the
  recorded path alone is **not** this case — that's the expected state
  after `using-digismith` entered a worktree, and tiers (b) and (c)
```
Replace with:
```markdown
  `finishing-a-development-branch`'s own flow over this. A miss on the
  recorded path alone is **not** this case — that's the expected state
  after `bootstrap`/`adopt` entered a worktree, and tiers (b) and (c)
```

- [ ] **Step 2: Update `skills/subagent-driven-always/SKILL.md`**

Find:
```markdown
Applies globally, in any DigiSmith-installed environment — not gated by
profile, and not limited to plans that started via
`digismith:using-digismith` (a plan that began mid-flight, on an
already-existing branch, still reaches this same trigger point).
```
Replace with:
```markdown
Applies globally, in any DigiSmith-installed environment — not gated by
profile, and not limited to plans that started via `digismith:init`
(whether dispatched through `bootstrap` or `adopt` — a plan adopted
mid-flight, on an already-existing branch, still reaches this same trigger
point).
```

- [ ] **Step 3: Update `skills/inject-standards/SKILL.md`**

Find:
```markdown
this invocation only — `digismith:using-digismith`'s own Step 0 is where
a stale pointer actually gets corrected, this skill doesn't rewrite
`.digismith/profile` itself.
```
Replace with:
```markdown
this invocation only — `digismith:bootstrap`'s own Step 0 (reused as-is by
`digismith:adopt`) is where a stale pointer actually gets corrected, this
skill doesn't rewrite `.digismith/profile` itself.
```

- [ ] **Step 4: Verify no dangling references**

```bash
grep -rln "using-digismith" skills/
```

Expected: no output (every active skill file reference has been updated;
only historical `.digismith/docs/using-digismith/` content remains, which is
outside `skills/`).

- [ ] **Step 5: Commit**

```bash
git add skills/telemetry/SKILL.md skills/subagent-driven-always/SKILL.md skills/inject-standards/SKILL.md
git commit -m "docs(digismith-init): update cross-references from using-digismith to bootstrap/adopt"
```

---

### Task 6: Update User-Facing Docs — README.md and docs/getting-started.md

**Files:**
- Modify: `README.md`
- Modify: `docs/getting-started.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: accurate user-facing documentation describing `init` as the
  front door and `bootstrap`/`adopt` as its internal workers.

- [ ] **Step 1: Update `README.md`'s front-door description**

Find:
```markdown
This README covers the one skill you actually invoke to start working:
**`using-digismith`**. Everything else on the roadmap (standards
injection, ticket intake, and what's still to come) is wired in behind
it or reachable directly — `using-digismith` is just the front door.
```
Replace with:
```markdown
This README covers the one skill you actually invoke to start working:
**`digismith:init`**. It's safe to invoke regardless of whether a ticket's
work is starting fresh or already mid-stream (a ticket ID pulled some other
way, with a spec and plan already written directly by vanilla Superpowers)
— it detects which applies and dispatches to one of two internal-only
workers: `bootstrap` for a fresh ticket, `adopt` for one already mid-stream.
Neither is invoked by name; `init` is the only front door. Everything else
on the roadmap (standards injection, ticket intake, and what's still to
come) is wired in behind it or reachable directly.
```

- [ ] **Step 2: Update the telemetry paragraph's marker reference**

Find:
```markdown
ticket's slice of the live session transcript back into DigiSmith's own
repo and commits it there, using a marker `using-digismith` dropped
before the build began to know where that slice starts.
```
Replace with:
```markdown
ticket's slice of the live session transcript back into DigiSmith's own
repo and commits it there, using a marker `bootstrap` or `adopt` dropped
before the build began to know where that slice starts.
```

- [ ] **Step 3: Update Quick Start**

Find:
```markdown
## Quick Start

Say something like:

> "Start work on EMKT-9001"
> "Begin implementation on this ticket"
> "Let's build this now — [paste ticket or describe the need]"

That's it. `using-digismith` takes it from there: gets a real ticket,
creates an isolated branch/worktree for it, and hands off into
`superpowers:brainstorming` with the ticket's content already loaded —
no cold start.
```
Replace with:
```markdown
## Quick Start

Say something like:

> "Start work on EMKT-9001"
> "Begin implementation on this ticket"
> "Let's build this now — [paste ticket or describe the need]"

That's it. `digismith:init` takes it from there. For a fresh ticket, it
gets a real ticket, creates an isolated branch/worktree for it, and hands
off into `superpowers:brainstorming` with the ticket's content already
loaded — no cold start.

Already mid-stream — a ticket ID from your own tooling, a spec and plan
already written directly by vanilla Superpowers, nothing built yet? Say so
the same way: "pick this up in DigiSmith" or "catch this ticket up to
DigiSmith." `init` detects the existing work and adopts it instead of
starting over: backfills the profile/ticket/branch state, relocates the
existing docs into DigiSmith's convention, and hands off straight to the
build stage — brainstorming/writing-plans are skipped since they already
ran.
```

- [ ] **Step 4: Update "What Happens, Step by Step" attributions**

Find each of the following four occurrences in the `## What Happens, Step
by Step` section and replace `using-digismith` with `bootstrap` (this
section describes the fresh-start path specifically, which is exactly what
`bootstrap` still does unchanged):

Find:
```markdown
If this conversation doesn't already have a ticket, `using-digismith`
invokes `digismith:jira-intake` for you:
```
Replace with:
```markdown
If this conversation doesn't already have a ticket, `bootstrap` invokes
`digismith:jira-intake` for you:
```

Find:
```markdown
Either door writes `.digismith/docs/<slug>/ticket.md` in the repo you're working
in. A Door 2 draft has no ticket key yet — if you try to start real
implementation work on one, `using-digismith` stops and tells you it
needs a real key first (see Edge Cases below).
```
Replace with:
```markdown
Either door writes `.digismith/docs/<slug>/ticket.md` in the repo you're working
in. A Door 2 draft has no ticket key yet — if you try to start real
implementation work on one, `bootstrap` stops and tells you it needs a
real key first (see Edge Cases below).
```

Find:
```markdown
Once a real ticket exists, `using-digismith`:
```
Replace with:
```markdown
Once a real ticket exists, `bootstrap`:
```

Find:
```markdown
From inside that worktree, `using-digismith` invokes
`superpowers:brainstorming` with the ticket's title, description, and
acceptance criteria already loaded as seed context. From there,
Superpowers' own chain takes over unmodified — brainstorming →
`writing-plans` → `subagent-driven-development`/`executing-plans` — with
its own approval gates at each stage. `using-digismith`'s job ends at
the hand-off; it never re-invokes or duplicates anything downstream.
```
Replace with:
```markdown
From inside that worktree, `bootstrap` invokes `superpowers:brainstorming`
with the ticket's title, description, and acceptance criteria already
loaded as seed context. From there, Superpowers' own chain takes over
unmodified — brainstorming → `writing-plans` →
`subagent-driven-development`/`executing-plans` — with its own approval
gates at each stage. `bootstrap`'s job ends at the hand-off; it never
re-invokes or duplicates anything downstream.

Already mid-stream instead? `adopt` reaches the same
`subagent-driven-development` stage directly — see
[`skills/adopt/SKILL.md`](skills/adopt/SKILL.md) for its exact process.
```

- [ ] **Step 5: Update Edge Cases table's `using-digismith` mention**

Find:
```markdown
| First run in a repo, and you decline to pick a profile | Stops there and explains a profile is required. No branch or worktree gets created. |
```
Leave this row as-is (it doesn't name `using-digismith` directly), but add
one new row after the existing "Branch name collides..." row:
```markdown
| The current worktree already has `.digismith/profile` | `init` reports "already initialized" and stops — no re-processing, no questions. |
```

- [ ] **Step 6: Update Current Scope and Full Skill Reference**

Find:
```markdown
## Current Scope

`using-digismith` is map item **E** ("the spine") — but only its first
slice: intake → branch → brainstorming hand-off. It's not yet the full
prescriptive driver described in the roadmap (enforcing stage order
end-to-end, routing through every future stage). Check
[`.digismith/history.html`](.digismith/history.html) for what's shipped so far and
what's still ahead.
```
Replace with:
```markdown
## Current Scope

`digismith:init` and its two workers are map item **E**, amended. The
fresh-start slice (`bootstrap`, unchanged) is intake → branch →
brainstorming hand-off; the mid-stream slice (`adopt`) is scoped to one
recurring case — ticket known, spec written, plan written, nothing built
yet. Joining before a spec/plan exists, or mid-build, is still out of
scope, and full stage-order enforcement across every future stage is still
not built. Check [`.digismith/history.html`](.digismith/history.html) for
what's shipped so far and what's still ahead.
```

Find:
```markdown
## Full Skill Reference

The exact instructions Claude follows live in
[`skills/using-digismith/SKILL.md`](skills/using-digismith/SKILL.md) and
[`skills/jira-intake/SKILL.md`](skills/jira-intake/SKILL.md) — read
those directly if you want the precise, unabridged process rather than
this summary.
```
Replace with:
```markdown
## Full Skill Reference

The exact instructions Claude follows live in
[`skills/init/SKILL.md`](skills/init/SKILL.md),
[`skills/bootstrap/SKILL.md`](skills/bootstrap/SKILL.md),
[`skills/adopt/SKILL.md`](skills/adopt/SKILL.md), and
[`skills/jira-intake/SKILL.md`](skills/jira-intake/SKILL.md) — read
those directly if you want the precise, unabridged process rather than
this summary.
```

- [ ] **Step 7: Update `docs/getting-started.md`'s trigger command**

Find:
```markdown
## 2. Trigger

From a session rooted in the target repo:

```
/digismith:using-digismith
```

or naturally: "start work on this ticket" / "begin implementation" /
"let's build this now — [paste ticket or describe the need]".
```
Replace with:
```markdown
## 2. Trigger

From a session rooted in the target repo:

```
/digismith:init
```

or naturally: "start work on this ticket" / "begin implementation" /
"let's build this now — [paste ticket or describe the need]" — or, for a
ticket already mid-stream elsewhere, "pick this up in DigiSmith."
```

- [ ] **Step 8: Update the telemetry marker reference in Section 5**

Find:
```markdown
- **P — telemetry.** At `finishing-a-development-branch`'s integration
  decision (merge, PR, or keep-as-is all count), commits this session's
  transcript slice back into DigiSmith's own repo. Gated by `logging`;
  the capture window starts wherever the marker gets written (normally
  `using-digismith` Step 1.5), not from true session start.
```
Replace with:
```markdown
- **P — telemetry.** At `finishing-a-development-branch`'s integration
  decision (merge, PR, or keep-as-is all count), commits this session's
  transcript slice back into DigiSmith's own repo. Gated by `logging`;
  the capture window starts wherever the marker gets written (normally
  `bootstrap` Step 1.5, or `adopt`'s equivalent step for mid-stream work),
  not from true session start.
```

- [ ] **Step 9: Update the Known Gaps section**

Find:
```markdown
## 6. Known gaps — don't expect these yet

- **E.2 isn't built.** There's no full stage-order enforcement or
  resume-mid-flight logic. Starting real work without going through
  `using-digismith` first (already on a branch, already coding) means
  G/M/N still fire fine off their own hooks, but P only captures from
  wherever its marker ends up written, not from wherever the work
  actually started.
```
Replace with:
```markdown
## 6. Known gaps — don't expect these yet

- **E.2 isn't built.** There's no full stage-order enforcement across
  every future stage. `init`'s mid-stream adoption (`adopt`) covers one
  specific recurring case — ticket known, spec and plan already written
  outside DigiSmith, nothing built yet — not joining at an arbitrary point
  (before a spec/plan exists, or mid-build). Outside that one case, G/M/N
  still fire fine off their own hooks, but P only captures from wherever
  its marker ends up written, not from wherever the work actually started.
```

- [ ] **Step 10: Verify no dangling references**

```bash
grep -rln "using-digismith" README.md docs/getting-started.md
```

Expected: no output.

- [ ] **Step 11: Commit**

```bash
git add README.md docs/getting-started.md
git commit -m "docs(digismith-init): document init/bootstrap/adopt in README and getting-started"
```

---

### Task 7: Update MEMORY.md and Retire the Resolved Backlog Item

**Files:**
- Modify: `MEMORY.md`
- Delete: `backlog/mid-development-workflow-injection.md`
- Modify: `backlog/README.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: the map/conventions sections describe the amended entry point;
  the backlog no longer lists a now-resolved item.

- [ ] **Step 1: Update MEMORY.md's map table, row E**

Find:
```markdown
| **E** | The spine | **E.1** first slice, shipped: intake → branch → brainstorming hand-off via `using-digismith` · **E.2** the rest of the prescriptive driver — full stage-order enforcement and routing to everything else as later stages ship |
```
Replace with:
```markdown
| **E** | The spine | **E.1** first slice, shipped: intake → branch → brainstorming hand-off via `digismith:init` (dispatching to `bootstrap`) · **E.1-amend** unified entry point, shipped: `digismith:init` also detects and adopts mid-stream work (`digismith:adopt`) for the recurring case where a ticket's spec/plan were already written outside DigiSmith · **E.2** the rest of the prescriptive driver — full stage-order enforcement and routing to everything else as later stages ship |
```

- [ ] **Step 2: Update MEMORY.md's map table, row P**

Find:
```markdown
| **P** | Telemetry | Captures the full Claude Code session transcript for a DigiSmith-driven ticket build (using-digismith start → finishing-a-development-branch's integration decision) and commits it back into DigiSmith's own repo, building a corpus for future process-improvement analysis. Raw and unredacted by deliberate choice — new letter, added directly per Jack's request during this brainstorm |
```
Replace with:
```markdown
| **P** | Telemetry | Captures the full Claude Code session transcript for a DigiSmith-driven ticket build (`digismith:init` start, via `bootstrap` or `adopt` → finishing-a-development-branch's integration decision) and commits it back into DigiSmith's own repo, building a corpus for future process-improvement analysis. Raw and unredacted by deliberate choice — new letter, added directly per Jack's request during this brainstorm |
```

- [ ] **Step 3: Update the Conventions section's spec-seam reference**

Find:
```markdown
  feature's spec/plan still land wherever those skills default to. That's
  exactly how the unified-docs-convention feature's own spec and plan ended
  up at the old `docs/superpowers/` location. `using-digismith`'s hand-off
  to `superpowers:brainstorming` is the natural place to eventually pass
```
Replace with:
```markdown
  feature's spec/plan still land wherever those skills default to. That's
  exactly how the unified-docs-convention feature's own spec and plan ended
  up at the old `docs/superpowers/` location. `bootstrap`'s hand-off
  to `superpowers:brainstorming` is the natural place to eventually pass
```

- [ ] **Step 4: Update the profile-pointer contract paragraph**

Find:
```markdown
  happens**: `using-digismith` Step 0 writes it in the original checkout, and Step 2.6 copies it
  into the worktree Step 2 creates or attaches — a worktree checks out only committed files, so
  without that copy it simply wouldn't be there. `inject-standards`,
  `capture-ephemeral-url`, `report-implementation`, and `using-digismith`'s own Step 1.5 (the
  `logging` gate) each read it from that working directory at their own trigger point; a missing
  file reads as "no profile" and silently restores unrestricted, pre-profiling behavior.
```
Replace with:
```markdown
  happens**: `bootstrap` Step 0 writes it in the original checkout, and Step 2.6 copies it
  into the worktree Step 2 creates or attaches — a worktree checks out only committed files, so
  without that copy it simply wouldn't be there. `digismith:adopt` reuses this exact Step 0/2.6
  logic by reference for the mid-stream case, rather than a second implementation. `inject-standards`,
  `capture-ephemeral-url`, `report-implementation`, and `bootstrap`'s own Step 1.5 (the
  `logging` gate) each read it from that working directory at their own trigger point; a missing
  file reads as "no profile" and silently restores unrestricted, pre-profiling behavior.
```

- [ ] **Step 5: Update the telemetry-marker contract paragraph**

Find:
```markdown
  guaranteed only by **physical presence wherever work happens** — `digismith:using-digismith`
  Step 1.5 writes it in the original checkout and Step 2.7 copies it into the worktree, exactly as
  2.6 does for `.digismith\profile`. Two skills touch it and no others:
  `digismith:using-digismith` writes it (and unconditionally `rm -f`s any prior one at the start of
  every run, so a stale marker can never be inherited by an unrelated ticket), and
  `digismith:telemetry` reads it after the build finishes and deletes it. Unlike the profile
```
Replace with:
```markdown
  guaranteed only by **physical presence wherever work happens** — `digismith:bootstrap`
  Step 1.5 writes it in the original checkout and Step 2.7 copies it into the worktree, exactly as
  2.6 does for `.digismith\profile`. `digismith:adopt` writes its own equivalent for the
  mid-stream case, mirroring the same unconditional-clear-first behavior. Three skills touch it
  and no others: `digismith:bootstrap` and `digismith:adopt` write it (each unconditionally
  `rm -f`s any prior one at the start of its own run, so a stale marker can never be inherited by
  an unrelated ticket), and `digismith:telemetry` reads it after the build finishes and deletes
  it. Unlike the profile
```

- [ ] **Step 6: Verify no dangling references in MEMORY.md**

```bash
grep -n "using-digismith" MEMORY.md
```

Expected: no output.

- [ ] **Step 7: Delete the resolved backlog item and its index entry**

```bash
git rm backlog/mid-development-workflow-injection.md
```

In `backlog/README.md`, find:
```markdown
- [Workflow: support joining mid-development](mid-development-workflow-injection.md) — DigiSmith's pipeline is too strict about starting from the top; need a way to inject mid-stream
```
Delete this line entirely (per the backlog's own convention: "Delete an
item's file once it's been applied").

- [ ] **Step 8: Commit**

```bash
git add MEMORY.md backlog/README.md
git commit -m "docs(digismith-init): update MEMORY.md map for E amendment, retire resolved backlog item"
```

---

### Task 8: Update `.digismith/history.html`

**Files:**
- Modify: `.digismith/history.html`

**Interfaces:**
- Consumes: nothing structural — documentation update reflecting Tasks 1-7's
  completed work.
- Produces: an up-to-date living tracker, matching the file's existing
  visual style and structure exactly (stat tiles, map table, tier table,
  timeline).

- [ ] **Step 1: Update the map table's row E**

Open `.digismith/history.html`. Find the row E `<td>` content:
```html
    <tr><td><strong>E</strong></td><td>The spine</td>
      <td><strong>E.1</strong> first slice, shipped: intake → branch → brainstorming hand-off via <code>using-digismith</code> <span class="status done">Done</span> · <strong>E.2</strong> the rest of the prescriptive driver — full stage-order enforcement and routing to everything else as later stages ship <span class="status todo">Not started</span></td>
      <td><span class="status next">In progress</span></td></tr>
```
Replace with:
```html
    <tr><td><strong>E</strong></td><td>The spine</td>
      <td><strong>E.1</strong> first slice, shipped: intake → branch → brainstorming hand-off via <code>digismith:init</code> (dispatching to <code>bootstrap</code>) <span class="status done">Done</span> · <strong>E.1-amend</strong> unified entry point, shipped: <code>init</code> also detects and adopts mid-stream work via <code>adopt</code>, for the recurring case where a ticket's spec/plan were already written outside DigiSmith <span class="status done">Done</span> · <strong>E.2</strong> the rest of the prescriptive driver — full stage-order enforcement and routing to everything else as later stages ship <span class="status todo">Not started</span></td>
      <td><span class="status next">In progress</span></td></tr>
```

- [ ] **Step 2: Add a design-spec reference line for this feature**

Near the existing per-map-item design-spec reference lines (e.g. the "P —
Telemetry" line already in the file), add one for this feature, matching
the existing style exactly:

```html
  <p style="font-size:.88rem; color:var(--muted);">
    <strong>E — DigiSmith Init (unified entry point):</strong>
    <a href="docs/digismith-init/design.html">design spec</a> ·
    <a href="docs/digismith-init/plan.md">plan</a>
  </p>
```

- [ ] **Step 3: Add a timeline entry**

Following the existing timeline entry markup pattern (matching whatever
the most recent entry's HTML structure looks like exactly), add one
covering: spec written and approved 2026-08-16, plan written and executed
2026-08-16 (or the actual date this task runs), noting this amends E.1
rather than starting a new map item, and resolves
`backlog/mid-development-workflow-injection.md`.

- [ ] **Step 4: Commit**

```bash
git add .digismith/history.html
git commit -m "docs(digismith-init): update history for E amendment (unified init entry point)"
```
