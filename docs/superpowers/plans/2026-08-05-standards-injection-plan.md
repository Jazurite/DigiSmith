# Standards Injection (G) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standards library (`standards/`) and four skills
(`discover-standards`, `add-standards`, `index-standards`,
`inject-standards`) that capture Jack's coding standards and fold them
into context — conversation, skill-building, planning, and implementer
subagent dispatch.

**Architecture:** DigiSmith becomes a real, installable Claude Code plugin
(`.claude-plugin/plugin.json` + `marketplace.json` at repo root) so the
four skills are actually loadable. Standards live as plain Markdown files
under `standards/global/` and `standards/shopify/`, indexed by
`standards/index.yml`. Three skills capture and maintain that library
(ported from Agent OS's `discover-standards` / `index-standards`, plus a
new manual-entry `add-standards`); the fourth (`inject-standards`) is the
mechanism that reads the index and folds matched standards into whichever
of four scenarios is in play, ending with the subagent-dispatch scenario
this whole feature exists for.

**Tech Stack:** Claude Code Skills (`SKILL.md`, YAML frontmatter), plain
Markdown standards content, YAML index file, JSON plugin manifests. No
application code, no test framework — these are instruction files.

## Global Constraints

- Skill frontmatter requires `name` and `description`; description starts
  with "Use when…", third person, states triggering conditions only —
  never a workflow summary (per `superpowers:writing-skills`'s Skill
  Discovery Optimization rules).
- Standards folders: `standards/global/` (any stack) and
  `standards/shopify/` (Shopify/Liquid/Emma-theme specific).
- `standards/index.yml` schema: `root:` sorts first if present, then
  folders alphabetically, then files alphabetically within each folder;
  file names without the `.md` extension; one-line descriptions only.
- Shopify-repo detection (used by `inject-standards`): the working repo
  qualifies for the `shopify/` layer if `docs/development-workflow.md`
  exists at its root, OR its name matches `shopify-template-*`.
- `inject-standards` scenario 4 (subagent dispatch): full standard content
  goes under a `## Standards` heading in the dispatch prompt — never
  `@`-references — and auto-includes `shopify/` without asking. Zero
  standards captured yet → proceed without a `## Standards` section rather
  than blocking dispatch.
- No automated test suite for `SKILL.md` files. Verification is a
  dogfooding pass: dispatch a subagent with the skill's content as its
  instructions and a concrete scenario, then check its behavior — per
  `superpowers:writing-skills`'s "Technique Skill" testing method
  (application scenarios, not the discipline-skill pressure-testing
  regimen — none of these four skills enforce a rule an agent would be
  tempted to violate under pressure).
- Plan format: this file stays Markdown. `superpowers:subagent-driven-development`'s
  `scripts/task-brief` parses task boundaries with the regex
  `^#+[ \t]+Task[ \t]+[0-9]+` — an HTML plan would break it. (The project's
  specs are HTML; plans are not — see the spec's format-note callout.)

---

### Task 1: Bootstrap the Plugin Scaffold

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`

**Interfaces:**
- Produces: a locally installable plugin named `digismith`, source `./`
  (self-hosted, same repo as its own marketplace) — later tasks' skills
  are discovered under this plugin once installed.

The repo currently has no `.claude-plugin/` directory and isn't
registered as a plugin anywhere on this machine (verified: absent from
`known_marketplaces.json` and `installed_plugins.json`). Without this
scaffold none of the skills built in later tasks are invocable via the
`Skill` tool.

- [ ] **Step 1: Create `.claude-plugin/plugin.json`**

```json
{
  "name": "digismith",
  "description": "Jack's personal SDLC plugin — ticket to delivery, built on top of Superpowers",
  "version": "0.1.0",
  "author": {
    "name": "Jack Huỳnh",
    "email": "jack@jazurite.com"
  },
  "keywords": [
    "sdlc",
    "standards",
    "skills",
    "personal"
  ]
}
```

- [ ] **Step 2: Create `.claude-plugin/marketplace.json`**

```json
{
  "name": "digismith",
  "description": "Personal marketplace for the DigiSmith SDLC plugin",
  "owner": {
    "name": "Jack Huỳnh",
    "email": "jack@jazurite.com"
  },
  "plugins": [
    {
      "name": "digismith",
      "description": "Jack's personal SDLC plugin — ticket to delivery, built on top of Superpowers",
      "version": "0.1.0",
      "source": "./",
      "author": {
        "name": "Jack Huỳnh",
        "email": "jack@jazurite.com"
      }
    }
  ]
}
```

- [ ] **Step 3: Validate both files are well-formed JSON**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json','utf8')); console.log('plugin.json OK')"
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json','utf8')); console.log('marketplace.json OK')"
```
Expected: both print `OK`, no parse errors.

- [ ] **Step 4: Commit**

```bash
git add .claude-plugin/plugin.json .claude-plugin/marketplace.json
git commit -m "feat(plugin): bootstrap digismith plugin scaffold"
```

- [ ] **Step 5: Manual verification (not part of the automated task loop)**

`/plugin` commands are interactive Claude Code CLI commands with no
scriptable tool equivalent — this step needs a human at the keyboard, not
a subagent. Ask Jack to run, in his own Claude Code session:

```
/plugin marketplace add D:\Workspace\Jazurite\DigiSmith
/plugin install digismith@digismith
```

Confirm the plugin lists as installed. This makes the skills built in
Tasks 2-5 invocable for real via the `Skill` tool going forward — it does
not block those tasks' own dogfood verification, which tests each
skill's content directly by dispatching a subagent with the `SKILL.md`
content as its instructions (see Global Constraints).

---

### Task 2: `index-standards` Skill

**Files:**
- Create: `skills/index-standards/SKILL.md`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `standards/index.yml`, written/rebuilt any time this skill
  runs. `discover-standards` (Task 4) and `add-standards` (Task 3) both
  invoke this skill by name as their final step. `inject-standards`
  (Task 5) reads `standards/index.yml` as its primary data source.

This is the foundation the other two capture skills call and
`inject-standards` reads from — build and verify it first.

- [ ] **Step 1: Write `skills/index-standards/SKILL.md`**

```markdown
---
name: index-standards
description: Use when standards files were added, edited, or deleted under DigiSmith's standards/ folder and index.yml needs rebuilding or syncing, or when inject-standards suggestions seem stale or wrong.
---

# Index Standards

## Overview

Rebuilds `standards/index.yml`, the lookup table `inject-standards` uses to
match relevant standards without reading every file. Maps each standard to
a one-line description.

## When to Use

- After `discover-standards` or `add-standards` create or edit files (they
  call this skill automatically as their last step — you don't normally
  invoke it directly for that case)
- After manually creating, editing, or deleting files under `standards/`
- If `inject-standards` suggestions seem out of sync with what's actually
  in `standards/`
- To clean up a stale or messy index

## Process

### Step 1: Scan for Standards Files

List every `.md` file under `standards/` and its subfolders. `root` is a
reserved keyword for `.md` files directly in `standards/` (not in a
subfolder) — never create an actual folder named `root`.

### Step 2: Load Existing Index

Read `standards/index.yml` if it exists. Note which entries already have
descriptions.

### Step 3: Diff

Compare the scan against the existing index:
- **New files** — no index entry yet
- **Deleted files** — index entry with no matching file
- **Existing files** — already indexed, keep as-is

### Step 4: Handle New Files

For each new file, read it and use `AskUserQuestion` to propose a one-line
description:

```
New standard needs indexing:
  File: shopify/branch-naming.md

Suggested description: "Branch naming convention for Emma tickets"

Accept? (yes / or type a better description)
```

Keep descriptions to one short sentence — they're for matching, not
documentation.

### Step 5: Handle Deleted Files

List any stale entries, then remove them automatically — no confirmation
needed:

```
Removed 1 stale index entry: shopify/old-pattern.md
```

### Step 6: Write the Index

```yaml
folder-name:
  file-name:
    description: Brief description here
```

Rules:
- `root:` sorts first if present, then folders alphabetically
- Files alphabetically within each folder
- File names without the `.md` extension
- One-line descriptions only

Example:
```yaml
root:
  general-principles:
    description: Universal coding principles that apply regardless of stack

global:
  error-handling:
    description: Error handling conventions across any language

shopify:
  branch-naming:
    description: Branch naming convention for Emma tickets
  commit-style:
    description: Commit message format and scope conventions
```

### Step 7: Report

```
Index updated:
  2 new entries added
  1 stale entry removed
  8 entries unchanged

Total: 9 standards indexed
```

## Output

Writes `standards/index.yml`.
```

- [ ] **Step 2: Create fixture files to test new-file detection**

```bash
mkdir -p standards/global standards/shopify
cat > standards/global/_test-fixture-one.md << 'EOF'
# Test Fixture One

Temporary file for verifying index-standards' new-file detection.
Delete after this task's test passes.
EOF
cat > standards/shopify/_test-fixture-two.md << 'EOF'
# Test Fixture Two

Temporary file for verifying index-standards' new-file detection.
Delete after this task's test passes.
EOF
```

- [ ] **Step 3: Dogfood — dispatch a subagent to run the skill against the fixtures**

Dispatch a subagent (Agent tool, general-purpose) with this prompt:

```
Follow the instructions in D:\Workspace\Jazurite\DigiSmith\skills\index-standards\SKILL.md
exactly, operating on D:\Workspace\Jazurite\DigiSmith\standards\. There are
two new unindexed files: global/_test-fixture-one.md and
shopify/_test-fixture-two.md. Index them (any reasonable one-line
description is fine — don't stop to ask a human, just pick one). Report
back the exact contents of the resulting standards/index.yml.
```

Expected: reported `index.yml` has two top-level keys, `global:` and
`shopify:` (alphabetical), each with one file entry matching the fixture
names (no `.md` extension) and a one-line `description:`.

- [ ] **Step 4: Verify prune-on-delete**

```bash
rm standards/global/_test-fixture-one.md standards/shopify/_test-fixture-two.md
```

Dispatch a second subagent with the same skill-following prompt style,
telling it both fixture files were deleted and to re-run the indexing
process. Expected: report says both entries were removed as stale, and
the resulting `standards/index.yml` is empty (or absent) again — confirm
by reading the file directly:

```bash
cat standards/index.yml 2>/dev/null || echo "no index.yml (empty state confirmed)"
```

- [ ] **Step 5: Commit**

```bash
git add skills/index-standards/SKILL.md
git commit -m "feat(standards): add index-standards skill"
```

(The fixture files and any test-produced `index.yml` are already removed
by Step 4 — nothing test-related should be staged here.)

---

### Task 3: `add-standards` Skill + Seed Real Standards Content

**Files:**
- Create: `skills/add-standards/SKILL.md`
- Create (dogfood output, real content): `standards/shopify/branch-naming.md`
- Create (dogfood output, real content): `standards/shopify/commit-style.md`
- Create (dogfood output, real content): `standards/shopify/docs-conventions.md`
- Modify: `standards/index.yml` (rebuilt by the `index-standards` invocation
  this skill triggers)

**Interfaces:**
- Consumes: the `index-standards` skill (Task 2), invoked as this skill's
  final step.
- Produces: the first real content in `standards/shopify/` — the seed the
  spec's Testing section calls for.

- [ ] **Step 1: Write `skills/add-standards/SKILL.md`**

```markdown
---
name: add-standards
description: Use when the user wants to manually add, dictate, or record a coding standard or convention directly rather than extract it from a codebase — phrases like "add a standard", "always do X", "make this a rule", "document this convention".
---

# Add Standards

## Overview

Manual-entry counterpart to `discover-standards`. The user dictates a rule
directly ("always use Shopify sections, never templates") instead of it
being extracted from code. Drafts the standard, confirms, writes the file,
then hands off to `index-standards`.

## When to Use

The user states a rule, convention, or preference they want captured for
future subagent briefs — without asking you to go analyze a codebase for
it. If they instead want you to look at existing code and infer patterns,
use `discover-standards` instead.

## Process

### Step 1: Capture the Rule

Take the user's statement as the seed. If it's ambiguous or too terse to
turn into a standalone rule, ask one clarifying question via
`AskUserQuestion` — don't guess at intent.

### Step 2: Determine the Folder

Ask (or infer from context) whether this belongs in `standards/global/`
(any stack) or `standards/shopify/` (Shopify/Liquid/Emma-theme specific).
If a related file already exists in either folder, offer to append to it
rather than create a duplicate — check both folders before drafting.

### Step 3: Draft and Confirm

Draft the standard following Writing Concise Standards (below), then
confirm with `AskUserQuestion` before writing:

```
Here's the draft for shopify/branch-naming.md:

---
# Branch Naming

Format: `EMKT-XXX__short-description`

- `EMKT-XXX` is the Jira ticket key
- Short description is lowercase, hyphen-separated
---

Create this file? (yes / edit: [changes] / skip)
```

### Step 4: Write the File

Create or append to `standards/<folder>/<name>.md`.

### Step 5: Trigger Indexing

Invoke the `index-standards` skill so the new/updated file gets indexed.

## Writing Concise Standards

Standards get injected into subagent context windows — every word costs
tokens.

- **Lead with the rule** — state what to do first, explain why second, only if needed
- **Use code examples** — show, don't tell
- **Skip the obvious** — don't document what the code already makes clear
- **One standard per concept** — don't combine unrelated patterns
- **Bullets over paragraphs** — scannable beats readable

## Quick Reference

| Step | Action |
|---|---|
| 1 | Capture the user's stated rule, clarify if ambiguous |
| 2 | Pick `global/` or `shopify/`, check for an existing file to append to |
| 3 | Draft, confirm via `AskUserQuestion` |
| 4 | Write `standards/<folder>/<name>.md` |
| 5 | Invoke `index-standards` |
```

- [ ] **Step 2: Dogfood — capture three real Emma conventions**

These three rules already exist today in Jack's global `CLAUDE.md`
(`docs/development-workflow.md` conventions section) — real content, not
placeholders. Dispatch a subagent (Agent tool, general-purpose) with this
prompt:

```
Follow the instructions in D:\Workspace\Jazurite\DigiSmith\skills\add-standards\SKILL.md
exactly, operating on D:\Workspace\Jazurite\DigiSmith\standards\. Add these
three standards to standards/shopify/ (skip the AskUserQuestion
confirmation steps and just write them — this is an automated dogfood
run, not an interactive session):

1. Branch naming: format is EMKT-XXX__short-description, where EMKT-XXX is
   the Jira ticket key and short-description is lowercase, hyphen-separated.

2. Commit style: use feat(scope):, fix(scope):, or refactor(scope):
   prefixes. Never reference AI tools or assistants in commit messages.

3. Docs conventions: specs live at docs/<feature>/specs/YYYY-MM-DD-design.md,
   plans at docs/<feature>/plans/YYYY-MM-DD-plan.md, progress reports at
   docs/<feature>/report.md. All three are gitignored and never committed —
   the progress report gets copied into Jira manually instead.

Follow the skill's own step 5 (invoke index-standards) once all three
files are written. Report the three file paths created and confirm
index-standards ran.
```

Expected files (content will vary slightly by the agent's exact phrasing —
that's fine, these aren't fixed templates):

- `standards/shopify/branch-naming.md` — states the `EMKT-XXX__short-description`
  format
- `standards/shopify/commit-style.md` — states the `feat(scope):` /
  `fix(scope):` / `refactor(scope):` prefixes and the no-AI-reference rule
- `standards/shopify/docs-conventions.md` — states the three doc paths and
  that they're gitignored/never committed

- [ ] **Step 3: Verify the files and index**

```bash
ls standards/shopify/
cat standards/index.yml
```

Expected: three files listed, and `standards/index.yml` has a `shopify:`
key with three entries (alphabetical), each with a one-line description.

- [ ] **Step 4: Commit**

```bash
git add skills/add-standards/SKILL.md standards/shopify/branch-naming.md \
  standards/shopify/commit-style.md standards/shopify/docs-conventions.md \
  standards/index.yml
git commit -m "feat(standards): add add-standards skill, seed shopify standards"
```

---

### Task 4: `discover-standards` Skill

**Files:**
- Create: `skills/discover-standards/SKILL.md`

**Interfaces:**
- Consumes: the `index-standards` skill (Task 2), invoked as this skill's
  final step.
- Produces: additional `standards/global/*.md` or `standards/shopify/*.md`
  content, extracted from a real codebase rather than dictated.

- [ ] **Step 1: Write `skills/discover-standards/SKILL.md`**

```markdown
---
name: discover-standards
description: Use when the user wants to extract coding standards or conventions from an existing codebase into DigiSmith's standards library — mentions capturing tribal knowledge, house rules, or consistent patterns already present in real code.
---

# Discover Standards

## Overview

Extracts tribal knowledge from a codebase into concise, documented
standards under `standards/global/` or `standards/shopify/`. One standard
completes the full ask-why → draft → confirm → write loop before the next
one starts — never batch multiple standards through the loop at once.

## When to Use

The user wants existing code analyzed for patterns worth documenting. If
they're instead dictating a rule directly with no codebase analysis
needed, use `add-standards` instead.

## Process

### Step 1: Determine Focus Area

If the user already specified an area, skip to Step 2.

Otherwise, analyze the codebase structure and identify 3-5 candidate
areas, then present via `AskUserQuestion`:

```
I've identified these areas in your codebase:

1. **API Routes** (src/api/) — Request handling, response formats
2. **Database** (src/models/) — Models, queries, migrations
3. **Components** (src/components/) — UI patterns, props, state

Which area should we focus on? (pick one, or suggest a different area)
```

Wait for the response before proceeding.

### Step 2: Analyze & Present Findings

1. Read 5-10 representative files in the chosen area
2. Look for patterns that are unusual, opinionated, tribal (a new dev
   wouldn't know without being told), or consistently repeated
3. Present findings via `AskUserQuestion`:

```
I analyzed [area] and found these potential standards:

1. **Response Envelope** — all responses use { success, data, error }
2. **Error Codes** — custom codes like AUTH_001, DB_002

Which would you like to document?

Options:
- Yes, all of them
- Just 1
- Add: [suggestion]
- Skip this area — nothing notable found
```

If nothing notable turns up, say so plainly and offer to pick another area
or skip — don't force a standard into existence.

### Step 3: Ask Why, Then Draft — One Standard at a Time

For **each** selected standard, complete this full loop before moving to
the next:

1. Ask 1-2 clarifying "why" questions via `AskUserQuestion` (e.g. "what
   problem does this solve?", "are there exceptions?", "what's the most
   common mistake here?")
2. Wait for the response
3. Draft the standard incorporating the answer (see Writing Concise
   Standards)
4. Confirm with the user before creating the file
5. Create the file if approved

Do not batch questions for multiple standards upfront.

### Step 4: Determine the Folder and Write

Pick `standards/global/` (any stack) or `standards/shopify/`
(Shopify/Liquid/Emma-theme specific). Check for an existing related file
first — append rather than create a duplicate if one exists. Write
`standards/<folder>/<name>.md`.

Then repeat Steps 3-4 for the next selected standard.

### Step 5: Trigger Indexing

Once all selected standards for this area are written, invoke the
`index-standards` skill.

### Step 6: Offer to Continue

```
Standards created for [area]:
- shopify/branch-naming.md
- shopify/commit-style.md

Discover standards in another area, or are we done?
```

## Writing Concise Standards

Standards get injected into subagent context windows — every word costs
tokens.

- **Lead with the rule** — state what to do first, explain why second, only if needed
- **Use code examples** — show, don't tell
- **Skip the obvious** — don't document what the code already makes clear
- **One standard per concept** — don't combine unrelated patterns
- **Bullets over paragraphs** — scannable beats readable

## Quick Reference

| Step | Action |
|---|---|
| 1 | Determine focus area (ask if not specified) |
| 2 | Read representative files, present findings |
| 3 | Per standard: ask why → draft → confirm |
| 4 | Write to `global/` or `shopify/`, check for append-vs-duplicate |
| 5 | Invoke `index-standards` |
| 6 | Offer to continue with another area |
```

- [ ] **Step 2: Identify a real Emma repo to test against**

This skill needs a real codebase to analyze — not a fixture. If you don't
already know the path to an Emma theme repo on this machine (e.g. one of
`shopify-template-kr`, `shopify-template-jp`, `shopify-template-ca`), ask
the user for one rather than guessing or running a broad filesystem
search.

- [ ] **Step 3: Dogfood — run discover-standards against that repo**

Dispatch a subagent (Agent tool, general-purpose) with this prompt
(substitute the real repo path from Step 2):

```
Follow the instructions in D:\Workspace\Jazurite\DigiSmith\skills\discover-standards\SKILL.md
exactly. The codebase to analyze is <EMMA_REPO_PATH>. Pick one candidate
area yourself (don't stop to ask a human which area — this is an
automated dogfood run), find 1-2 real patterns worth documenting, and for
each: state the "why" question you'd ask, give a reasonable answer
yourself, draft the standard, and write it to
D:\Workspace\Jazurite\DigiSmith\standards\shopify\ (this is a Shopify
repo, so shopify/ is the right folder — confirm that judgment in your
report). Invoke index-standards at the end per the skill's Step 5.
Report: the area you picked, the pattern(s) found, and the file(s)
written.
```

Expected: report names a real area from the target repo, 1-2 new files
appear under `standards/shopify/`, and `standards/index.yml` gains
matching entries.

- [ ] **Step 4: Verify**

```bash
git status standards/
cat standards/index.yml
```

Expected: new file(s) under `standards/shopify/` beyond Task 3's three,
and `standards/index.yml`'s `shopify:` section reflects them.

- [ ] **Step 5: Commit**

```bash
git add skills/discover-standards/SKILL.md standards/shopify/ standards/index.yml
git commit -m "feat(standards): add discover-standards skill"
```

---

### Task 5: `inject-standards` Skill + Full Integration Dogfood

**Files:**
- Create: `skills/inject-standards/SKILL.md`

**Interfaces:**
- Consumes: `standards/index.yml` (Tasks 2-4) as its primary data source;
  the Shopify-repo detection rule from Global Constraints.
- Produces: the mechanism map item G exists for. Nothing downstream in
  this plan consumes it — `H` (Tier 2, not in scope here) will later call
  its scenario 4 automatically.

This is the last skill and ties the other three together — its dogfood
pass exercises the whole feature end to end, per the spec's Testing
section.

- [ ] **Step 1: Write `skills/inject-standards/SKILL.md`**

```markdown
---
name: inject-standards
description: Use when relevant coding standards need to be pulled into the current context — before writing code, building a new DigiSmith skill, brainstorming or planning, or about to dispatch an implementer subagent via the Agent tool.
---

# Inject Standards

## Overview

Reads `standards/index.yml`, matches relevant standards against the
current work, and folds them into context — formatted differently
depending on which of four scenarios is in play.

## Usage Modes

**Auto-suggest** (no target named) — analyze context, suggest matches.

**Explicit** (folder or file named) — skip suggestion, inject directly,
still validate the target exists.

## Process

### Step 1: Check the Index Exists

Read `standards/index.yml`. If it doesn't exist:

```
No standards index found. Run discover-standards or add-standards first,
or index-standards if standards files exist without an index.
```

Stop here if missing.

### Step 2: Detect the Scenario

| Scenario | Trigger |
|---|---|
| 1. Conversation | Default — regular chat / implementation work |
| 2. Creating a Skill | Editing a `skills/*/SKILL.md` file |
| 3. Shaping/Planning | In plan mode, or "spec"/"plan"/"shape" language, or running brainstorming/writing-plans |
| 4. Dispatching a Subagent | About to fire an `Agent` tool call to build something |

If ambiguous, ask via `AskUserQuestion` rather than guess:

```
I'll inject the relevant standards. How should I format them?

1. Conversation — read into chat for implementation work
2. Skill — file references or content for a skill you're building
3. Plan — file references or content for a plan/spec you're building
4. Subagent dispatch — full content for an Agent tool prompt

Which scenario?
```

### Step 3: Detect Shopify-Repo Layer (all scenarios)

The current working repo qualifies for the `standards/shopify/` layer if
either is true:
- `docs/development-workflow.md` exists at the repo root, or
- the repo name matches `shopify-template-*`

Scenarios 1-3: surface `shopify/` matches as ordinary suggestions the user
confirms, same as anything else. Scenario 4: auto-include without asking.

If the repo qualifies but `standards/shopify/` is empty or doesn't exist,
silently skip it — there's nothing to inject, and this is not an error.

### Step 4: Match and Suggest (skip in Explicit Mode)

Match `index.yml` descriptions against the current work context. Present
2-5 suggestions via `AskUserQuestion`:

```
Based on your task, these standards may be relevant:

1. shopify/branch-naming — Branch naming convention for Emma tickets
2. global/error-handling — Error handling conventions across any language

Inject these? (yes / just 1 / add: shopify/commit-style / none)
```

### Step 5: Parse Explicit Targets (Explicit Mode only)

Arguments can be a folder (`shopify` → all files in it), a folder/file
(`shopify/branch-naming` → one file), or `root`/`root/<file>` for files
directly in `standards/`. If a named target doesn't exist:

```
Standard not found: shopify/nonexistent

Available standards in shopify/:
- branch-naming
- commit-style

Did you mean one of these?
```

### Step 6: Inject, Formatted for the Scenario

**Scenario 1 — Conversation.** Read the standards and announce them
inline:

```
I've read the following standards as relevant to what we're working on:

--- Standard: shopify/branch-naming ---
[full file content]
--- End Standard ---

Key points:
- Format: EMKT-XXX__short-description
```

**Scenarios 2 & 3 — Creating a Skill / Shaping-Planning.** Ask which
inclusion mode first:

```
How should these standards be included?

1. References — @-file paths, stays in sync with the standards library
2. Copy content — pasted inline, self-contained but can drift

Which approach?
```

References mode:
```
Reference these standards files in the appropriate location:

@standards/shopify/branch-naming.md
@standards/global/error-handling.md
```

Copy-content mode: same `--- Standard: ... ---` block format as Scenario
1, one block per matched standard.

**Scenario 4 — Dispatching a Subagent.** No inclusion-mode question — a
freshly dispatched subagent has no guaranteed visibility into DigiSmith's
plugin path, so always copy full content, under a `## Standards` heading,
directly into the subagent's prompt:

```
## Standards

--- Standard: shopify/branch-naming ---
[full file content]
--- End Standard ---
```

If zero standards exist anywhere (fresh install), proceed without a
`## Standards` section rather than blocking the dispatch — this skill
augments the brief, it doesn't gate dispatch.

## Quick Reference

| Step | Action |
|---|---|
| 1 | Read `standards/index.yml`, stop if missing |
| 2 | Detect scenario (1-4), ask if ambiguous |
| 3 | Detect Shopify-repo layer (2 signals) |
| 4 | Match + suggest (skip if explicit target given) |
| 5 | Parse explicit target if given, validate it exists |
| 6 | Inject formatted for the scenario |
```

- [ ] **Step 2: Dogfood scenario 1 (Conversation)**

Dispatch a subagent (Agent tool, general-purpose) with:

```
Follow the instructions in D:\Workspace\Jazurite\DigiSmith\skills\inject-standards\SKILL.md
exactly, operating on D:\Workspace\Jazurite\DigiSmith\. Scenario: you're in
a plain conversation about renaming a branch for a new Emma ticket
EMKT-4521, "fix cart drawer padding". Detect the scenario, match relevant
standards, skip the AskUserQuestion confirmation (auto-accept your own
suggestions — this is an automated dogfood run), and produce the final
injected output. Report the output verbatim.
```

Expected: report identifies Scenario 1 (Conversation), matches
`shopify/branch-naming` (and plausibly others), and the output uses the
`--- Standard: ... ---` block format with the real file content inline.

- [ ] **Step 3: Dogfood scenario 2 (Creating a Skill)**

Same dispatch pattern, scenario: "you are editing
`skills/some-new-skill/SKILL.md` and want relevant standards included."
Expected: report identifies Scenario 2, offers references-vs-copy, and
(picking references for this test) outputs `@standards/...` paths.

- [ ] **Step 4: Dogfood scenario 3 (Shaping/Planning)**

Same dispatch pattern, scenario: "you are in plan mode writing a spec for
a new Emma feature." Expected: report identifies Scenario 3, same
references-vs-copy choice as Scenario 2.

- [ ] **Step 5: Dogfood scenario 4 (Dispatching a Subagent)**

Same dispatch pattern, scenario: "you are about to fire an Agent tool
call to implement a small fix in an Emma repo." Expected: report
identifies Scenario 4, auto-includes `shopify/` without asking, and
produces a `## Standards` block with full content (no references, no
inclusion-mode question asked).

- [ ] **Step 6: Verify the zero-standards edge case**

Temporarily move the index aside, confirm the "stop, tell the user to run
discover-standards/add-standards" behavior, then restore it:

```bash
mv standards/index.yml /tmp/index.yml.bak 2>/dev/null || mv standards/index.yml standards/index.yml.bak
```

Dispatch a subagent with the same skill-following prompt style, scenario:
plain conversation, no target specified. Expected: report says it found no
index and told the user to run `discover-standards` or `add-standards`
(or `index-standards`) — it does not fabricate suggestions.

```bash
mv standards/index.yml.bak standards/index.yml 2>/dev/null || mv /tmp/index.yml.bak standards/index.yml
cat standards/index.yml   # confirm restored
```

- [ ] **Step 7: Commit**

```bash
git add skills/inject-standards/SKILL.md
git commit -m "feat(standards): add inject-standards skill"
```

- [ ] **Step 8: Final note for whoever runs this plan**

Once Task 1's manual `/plugin install` step has been done for real, do one
last live sanity check outside the automated task loop: ask Claude (in a
normal session, working directory anywhere) to invoke `inject-standards`
directly through the `Skill` tool rather than via a pasted-instructions
subagent, and confirm it's discoverable and behaves the same as the
dogfood runs above. This isn't a blocking step — the four skills are
already verified by Steps 2-6 above — it's confirmation that the plugin
installation from Task 1 is wired up correctly for everyday use.
