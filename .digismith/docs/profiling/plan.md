# Profiling (O) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `profiling` — DigiSmith's map item **O** — a per-repo
behavior profile (standards subset, ticket/ephemeral/reporting on-off)
that `using-digismith`, `inject-standards`, `capture-ephemeral-url`, and
`report-implementation` each consult independently at their own trigger
point, so the existing "everything on" Emma flow and a lighter Personal
flow (no ticket, no ephemeral capture) become a declared per-repo choice
instead of an undocumented, ad hoc deviation.

**Architecture:** Two new flat YAML files (`profiles/emma.yml`,
`profiles/personal.yml`) ship inside DigiSmith's own repo. Each consuming
repo records its choice in a one-line `.digismith/profile` file. Four
existing skills each gain an additive read of that file at their own
trigger point — no central orchestrator, no inheritance, no new skill
file for switching.

**Tech Stack:** Claude Code Skills (`SKILL.md`, YAML frontmatter) plus two
plain YAML config files. No application code, no test framework —
verification is dogfooding via dispatched subagents reasoning through the
modified skill instructions against constructed fixtures, consistent with
every DigiSmith skill so far.

## Global Constraints

- Skill frontmatter requires `name` and `description`; description starts
  with "Use when…", third person, states triggering conditions only —
  never a workflow summary.
- **Not an inheritance/composition system.** Profiles are flat,
  independent YAML files with no extends/override chain.
- **Not auto-detected.** The profile is always an explicit choice made
  via `using-digismith`'s Step 0 or its switch-profile front door — never
  inferred from repo signals. Additive to, not a replacement for,
  `inject-standards`'s existing Shopify-repo-layer heuristic (Step 3 in
  its current numbering), which still governs repos that have no profile
  file at all.
- **Not retroactive.** Switching a repo's profile mid-point only changes
  decisions for stages not yet entered.
- **No toggle keys for unbuilt stages.** Delivery (**D**), QA handoff
  (**I**), design review (**F**), and estimation (**J**) aren't built
  yet — no toggle keys are added for them in this plan.
- **Not a separate switch-profile skill.** Switching is a front-door
  intent inside `using-digismith`, added in Task 1.
- **`profiles/<name>.yml` schema** (exact fields, no others): `name`
  (string), `standards` (list of `standards/` subfolder names, may be
  empty), `ticket` (bool), `ephemeral` (bool), `reporting` (bool). Ships
  with exactly these two files, verbatim:

  ```yaml
  # profiles/emma.yml
  name: emma
  standards: [global, shopify, team]
  ticket: true
  ephemeral: true
  reporting: true
  ```

  ```yaml
  # profiles/personal.yml
  name: personal
  standards: []
  ticket: false
  ephemeral: false
  reporting: true
  ```
- **`.digismith/profile`** (consuming repo, alongside the existing
  `.digismith/docs/` convention): one-line plain text containing just the
  active profile's name (e.g. `emma`). Not YAML — a single value today.
- **No `.digismith/profile` at all → every consuming skill falls back to
  its prior, unrestricted behavior.** This is the load-bearing
  non-breaking guarantee: every repo already using DigiSmith today, and
  DigiSmith's own repo itself (which never runs its own feature work
  through `using-digismith`), must see zero behavior change.
- **Locating `profiles/<name>.yml`** — DigiSmith's own repo, resolved by
  the exact rule `inject-standards` already uses for `standards/` (see
  its "Locating the Standards Library" section): (1) is the current
  working directory itself the DigiSmith repo (has
  `.claude-plugin/plugin.json` with `"name": "digismith"`)? Use it
  directly. (2) Otherwise, ask the user for DigiSmith's repo path this
  session and remember it for the rest of the conversation. Never read
  `profiles/` under a plugin cache path
  (`~/.claude/plugins/cache/.../digismith/<version>/`) — a stale,
  version-locked snapshot. Every task below that adds a profile read
  restates this rule inline in its target `SKILL.md`, the same way
  `using-digismith`'s existing Step 2 already restates
  `jira-intake`'s slug algorithm rather than cross-referencing it at
  runtime — a freshly dispatched subagent only sees the one `SKILL.md`
  it was told to follow.
- **Stale profile** (`.digismith/profile` names a profile with no
  matching `profiles/<name>.yml`) → treat as stale, re-run the first-use
  picker rather than guessing or silently falling back.
- **`profiles/` missing or empty in DigiSmith's own install** → stop and
  report clearly, same can't-proceed pattern `jira-intake` already uses
  for its own blocking conditions.
- Cross-skill references inside `SKILL.md` content must be
  plugin-qualified: `superpowers:brainstorming`,
  `digismith:jira-intake`, `digismith:inject-standards`,
  `digismith:using-digismith`.
- **Roadmap update:** `MEMORY.md`'s map table gets a new row — **O —
  Profiling** — placed in **Tier 1** ("the frame") alongside **G** and
  **E**, per the design spec's own Roadmap Update section.
- Task order matters: Task 1 fixes the `profiles/<name>.yml` schema and
  `.digismith/profile` convention that Tasks 2-4 each independently
  consume. Do not reorder.

---

### Task 1: Profile Definitions + `using-digismith` Profile Resolution

**Files:**
- Create: `profiles/emma.yml`
- Create: `profiles/personal.yml`
- Modify: `skills/using-digismith/SKILL.md`

**Interfaces:**
- Consumes: nothing from an earlier task (first task).
- Produces: `profiles/emma.yml` and `profiles/personal.yml` (the fixed
  schema every later task reads), and the `.digismith/profile`
  read/write contract at `using-digismith`'s Step 0/2/3, that Tasks 2-4
  each independently re-read.

- [ ] **Step 1: Create the two profile files**

```yaml
# profiles/emma.yml
name: emma
standards: [global, shopify, team]
ticket: true
ephemeral: true
reporting: true
```

```yaml
# profiles/personal.yml
name: personal
standards: []
ticket: false
ephemeral: false
reporting: true
```

- [ ] **Step 2: Insert a new Step 0 into `skills/using-digismith/SKILL.md`, before the existing "### Step 1: Get a Real Ticket"**

```markdown
### Step 0: Resolve Profile

Check for `.digismith/profile` in the repo currently being worked in
(never DigiSmith's own repo).

**Present** → read its one-line content as the active profile name.
Validate it against `profiles/<name>.yml` (see Locating DigiSmith's Repo
below) — no matching file → treat as stale, fall through to the
first-use flow below instead of guessing.

**Missing, or stale** → first use in this repo (or a stale pointer):
1. Locate DigiSmith's own repo — same rule `digismith:inject-standards`
   uses for `standards/`: is the current working directory itself the
   DigiSmith repo (`.claude-plugin/plugin.json` with
   `"name": "digismith"`)? Use it directly. Otherwise ask the user for
   DigiSmith's repo path this session and remember it. Never read
   `profiles/` under a plugin cache path — a stale, version-locked
   snapshot.
2. List `profiles/*.yml` there. If `profiles/` is missing or empty, stop
   and report clearly — this shouldn't happen in a normal install.
3. Present the available profiles via `AskUserQuestion`, one option per
   file, using each file's own `name` field and a one-line summary of
   its toggles (e.g. "emma — ticket, standards, and ephemeral capture
   all on" / "personal — ticket and ephemeral capture off; standards
   empty").
4. If the user declines to pick (see Error Handling), stop here —
   explain a profile is required to proceed. Don't create a branch or
   worktree.
5. Write the chosen profile's `name` field, and only that, as the sole
   line of `.digismith/profile` in the repo being worked in.

Either way, the resolved profile's `profiles/<name>.yml` content (its
`ticket`, `ephemeral`, `standards`, `reporting` fields) is now available
for Step 1 and Step 2 below.

**Switching profiles mid-session:** if the user's request is "switch
this repo's profile to X" rather than "start work on a ticket", handle
it here instead of proceeding to Step 1: validate `X` against
`profiles/*.yml` (same locate rule as above), state the behavioral delta
(which of ticket/ephemeral/standards/reporting change, and how) via
`AskUserQuestion`, and on confirmation overwrite `.digismith/profile`
with the new name. This is `using-digismith`'s own job done at this
point — don't fall through into Step 1's ticket flow unless the user's
original request was also to start work.
```

- [ ] **Step 3: Make Step 1 ("Get a Real Ticket") conditional on the resolved profile**

Add this paragraph immediately after Step 1's existing first paragraph
(the "Check whether this conversation already produced a
`.digismith/docs/<slug>/ticket.md`..." one), before the "If the result
has no `**Key:**` line..." paragraph:

```markdown
**If the active profile's `ticket` field is `false`:** skip invoking
`digismith:jira-intake` entirely — no `ticket.md` is written. Derive the
slug directly from the feature description, applying the exact same
deterministic rule `digismith:jira-intake` Step 3.1 already defines:
lowercase, drop filler words (a, an, the, on, to, of, for, in), replace
remaining non-alphanumeric runs with a single hyphen, then truncate to
~40 characters at a word boundary — never leaving a trailing filler word
or hyphen. Restated inline here since `digismith:jira-intake` itself
isn't invoked in this path, not reinvented as a different algorithm. Skip
the rest of Step 1 (no ticket content to read into context) and go
straight to Step 2.
```

- [ ] **Step 4: Make Step 2 ("Create the Branch") conditional on the resolved profile**

Modify Step 2's sub-step 2 ("Branch name:") to:

```markdown
2. Branch name: if the active profile's `ticket` field is `true`,
   `<Key>__<slug>` — e.g.
   `EMKT-9001__fix-cart-drawer-padding-mobile`, using the ticket's actual
   `**Key:**` value verbatim (not a hardcoded `EMKT-` prefix). If `ticket`
   is `false`, `<slug>` alone, with no key prefix at all — e.g.
   `fix-cart-drawer-padding-mobile`. Everywhere else in this step and
   Step 3 that says `<Key>__<slug>`, read it as whichever of the two
   forms this profile produced.
```

- [ ] **Step 5: Update the Quick Reference table**

Add a new first row and adjust the existing ones:

```markdown
| Step | Action |
|---|---|
| 0 | Resolve `.digismith/profile` (or run first-use picker / handle an explicit profile switch) |
| 1 | Get a real ticket if the active profile's `ticket` is `true` (invoke `digismith:jira-intake` if needed, stop if key-less); if `ticket` is `false`, derive the slug directly and skip to Step 2; read `.digismith/docs/<slug>/ticket.md`'s full content into context now when it exists — a worktree checks out only committed files, and this one isn't committed yet (and may be gitignored outright), so it won't exist in the worktree |
| 2 | Derive `<Key>__<slug>` (or `<slug>` alone under `ticket: false`) branch name; reuse an existing worktree, or attach one to an existing branch (`git worktree add`, no `-b`), or create both (verify/rename to the exact name if the creation tool altered it); ask on collision with an unrelated ticket |
| 3 | Invoke `superpowers:brainstorming` with the Step 1 ticket content as seed context (when there is any); Superpowers' own chain takes over from there |
```

- [ ] **Step 6: Update Error Handling**

Add two new bullets to the Error Handling section:

```markdown
- **User declines to pick a profile on first use** → stop after
  explaining a profile is required to proceed. Don't create a branch or
  worktree.
- **`.digismith/profile` names a profile with no matching
  `profiles/<name>.yml`** → treat as stale, re-run the first-use picker
  rather than guessing.
```

- [ ] **Step 7: Dogfood — first use, Emma**

Dispatch a subagent (Agent tool, general-purpose):

```
Follow only Step 0 ("Resolve Profile") of
D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\profiling\skills\using-digismith\SKILL.md, reasoning
through this scenario:

- Repo being worked in has no .digismith/profile file (first use).
- DigiSmith's own repo is D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\profiling
  (has .claude-plugin/plugin.json with "name": "digismith" — verify this
  yourself by reading that file).
- List profiles/*.yml there for real and read their content.
- You are asked (simulate AskUserQuestion by just stating which option
  you'd present and picking "emma" as the answer, since AskUserQuestion
  isn't available to you here).

Report: the two profile options you'd present (with their one-line
summaries derived from the real YAML content), which one was picked, and
the exact one-line content you'd write to .digismith/profile. Do not
actually write any file — this is a reasoning-only dogfood run.
```

Expected: reports both `emma` and `personal` with summaries matching
their real YAML fields (ticket/ephemeral/standards for emma all
on/populated; personal's ticket/ephemeral off, standards empty), and
that it would write the single line `emma` to `.digismith/profile`.

- [ ] **Step 8: Dogfood — first use, Personal, then Step 1 skip**

Dispatch a subagent (Agent tool, general-purpose):

```
Follow Step 0 ("Resolve Profile") and then Step 1 ("Get a Real Ticket")
of D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\profiling\skills\using-digismith\SKILL.md,
reasoning through this scenario:

- Repo being worked in has no .digismith/profile file (first use).
- DigiSmith's own repo is D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\profiling.
- The user picks "personal" (simulate the AskUserQuestion answer).
- The feature description is: "Add a dark mode toggle to the settings
  page."

Report: the profile you'd write, whether digismith:jira-intake gets
invoked (per the personal profile's ticket:false field), and the exact
slug you'd derive from the feature description using Step 1's restated
algorithm.
```

Expected: reports `personal` written, `digismith:jira-intake` NOT
invoked, and slug `add-dark-mode-toggle-settings-page` (or equivalent
correct application of the stated algorithm — filler words "a"/"to"/"the"
dropped, kebab-case, no trailing hyphen).

- [ ] **Step 9: Dogfood — stale profile pointer**

Dispatch a subagent (Agent tool, general-purpose):

```
Follow only Step 0 ("Resolve Profile") of
D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\profiling\skills\using-digismith\SKILL.md, reasoning
through this scenario: .digismith/profile in the repo being worked in
contains the single line "enterprise" (no profiles/enterprise.yml exists
in DigiSmith's own repo at
D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\profiling\profiles\ —
verify this yourself by listing that directory). Per the skill, this is a
stale pointer. Report what the skill says to do.
```

Expected: reports treating it as stale and re-running the first-use
picker, not guessing or silently falling back to some default.

- [ ] **Step 10: Dogfood — mid-point profile switch**

Dispatch a subagent (Agent tool, general-purpose):

```
Follow only Step 0 ("Resolve Profile") of
D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\profiling\skills\using-digismith\SKILL.md, reasoning
through this scenario: the user's request is "switch this repo's profile
to personal" (not a request to start work on a ticket). The repo being
worked in currently has .digismith/profile containing "emma". DigiSmith's
own repo is
D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\profiling. Report:
whether this is handled inside Step 0 or falls through to Step 1, and the
behavioral-delta statement you'd present before asking for confirmation
(compare emma's real YAML fields to personal's).
```

Expected: reports handling it entirely inside Step 0 (never falling
through to Step 1's ticket flow), and a delta statement naming that
`ticket` goes true→false, `ephemeral` goes true→false, and `standards`
goes from `[global, shopify, team]` to `[]` (reporting stays true→true,
worth noting as unchanged or omitting — either is acceptable as long as
the three real changes are named correctly).

- [ ] **Step 11: If any dogfood run in Steps 7-10 surfaced a real gap, fix it now**

If every report matched its expected outcome, skip this step. Otherwise
fix `skills/using-digismith/SKILL.md`'s wording directly, then re-run the
specific dogfood step that failed to confirm the fix.

- [ ] **Step 12: Commit**

```bash
cd D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\profiling
git add profiles/emma.yml profiles/personal.yml skills/using-digismith/SKILL.md
git commit -m "feat(profiling): add profile definitions and using-digismith profile resolution"
```

---

### Task 2: `inject-standards` Profile Gate

**Files:**
- Modify: `skills/inject-standards/SKILL.md`

**Interfaces:**
- Consumes: `profiles/<name>.yml`'s `standards` field and
  `.digismith/profile` from Task 1.
- Produces: nothing new downstream — this task only changes which
  standards are eligible for matching in Steps 4-6, unchanged for any
  repo with no profile file.

- [ ] **Step 1: Insert a new Step 0 into `skills/inject-standards/SKILL.md`, before the existing "### Step 1: Check the Index Exists"**

```markdown
### Step 0: Profile Gate

Check for `.digismith/profile` in the repo currently being worked in
(the repo whose code this invocation is about — never DigiSmith's own
repo, which is only where `standards/` and `profiles/` themselves live).

**Missing** → unchanged, existing behavior: every folder in
`standards/index.yml` is eligible for matching in Steps 4-6, including
the Step 3 Shopify-repo-layer heuristic exactly as it works today. Skip
the rest of this step.

**Present** → read its one-line content as the active profile name.
Locate DigiSmith's own repo — same rule already used above under
"Locating the Standards Library": is the current working directory
itself the DigiSmith repo (`.claude-plugin/plugin.json` with
`"name": "digismith"`)? Use it directly. Otherwise ask the user for
DigiSmith's repo path this session and remember it. Read
`profiles/<name>.yml` there. No matching file → treat as stale; proceed
as if `.digismith/profile` were missing (the "Missing" branch above) for
this invocation only — `using-digismith`'s own Step 0 is where a stale
pointer actually gets corrected, this skill doesn't rewrite
`.digismith/profile` itself.

Otherwise, only folders named in that profile's `standards` list are
eligible for matching in every scenario (1-4) below — an empty list
means skip straight to "proceed without a Standards section," same as
the existing zero-standards-exist path. This gate applies uniformly to
every `standards/` subfolder, `global/` included — the "`global/` never
has a repo-type gate" statement in Step 3 refers only to the Shopify-repo
auto-include check below, not to this profile gate.
```

- [ ] **Step 2: Update the Quick Reference table**

Add a new first row:

```markdown
| Step | Action |
|---|---|
| 0 | Profile gate: `.digismith/profile` present → only its `standards` list's folders are eligible below; missing → unchanged, all folders eligible |
| 1 | Read `standards/index.yml`, stop if missing (except Scenario 4 — proceed without standards instead) |
| 2 | Detect scenario (1-4), ask if ambiguous |
| 3 | Detect Shopify-repo layers (2 signals) — gates `shopify/` + `team/` for Scenario 4's auto-include only, never a filter in Scenarios 1-3; `global/` is never gated by this specific check |
| 4 | Match + suggest (skip if explicit target given) |
| 5 | Parse explicit target if given, validate it exists |
| 6 | Inject formatted for the scenario |
```

- [ ] **Step 3: Dogfood — Personal profile, empty standards list**

```bash
mkdir -p /tmp/inject-standards-dogfood/personal-repo/.digismith
echo "personal" > /tmp/inject-standards-dogfood/personal-repo/.digismith/profile
```

Dispatch a subagent (Agent tool, general-purpose):

```
Follow only Step 0 ("Profile Gate") of
D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\profiling\skills\inject-standards\SKILL.md, reasoning
through this scenario: the repo being worked in is
/tmp/inject-standards-dogfood/personal-repo (has .digismith/profile
containing "personal" — read it for real). DigiSmith's own repo is
D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\profiling — read the
real profiles/personal.yml there. Report what Step 0 concludes: which
standards/ folders (if any) are eligible for matching, and what happens
next (does it proceed to Step 1, or skip straight to "no Standards
section"?).
```

Expected: reports the `standards` list is empty, so it proceeds straight
to "no Standards section" without any folder eligible for matching.

- [ ] **Step 4: Dogfood — no profile file, unchanged behavior**

Dispatch a subagent (Agent tool, general-purpose):

```
Follow only Step 0 ("Profile Gate") of
D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\profiling\skills\inject-standards\SKILL.md, reasoning
through this scenario: the repo being worked in is
D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\profiling itself (verify
for real whether .digismith/profile exists there — it should not, this
is DigiSmith's own repo). Report what Step 0 concludes.
```

Expected: reports `.digismith/profile` is missing, so Step 0 is a no-op —
every folder in `standards/index.yml` (currently `shopify` and `team`,
verify by reading the real file) stays eligible, existing behavior
unchanged.

- [ ] **Step 5: Dogfood — Emma profile, subset list**

```bash
mkdir -p /tmp/inject-standards-dogfood/emma-repo/.digismith
echo "emma" > /tmp/inject-standards-dogfood/emma-repo/.digismith/profile
```

Dispatch a subagent (Agent tool, general-purpose):

```
Follow only Step 0 ("Profile Gate") of
D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\profiling\skills\inject-standards\SKILL.md, reasoning
through this scenario: the repo being worked in is
/tmp/inject-standards-dogfood/emma-repo (has .digismith/profile containing
"emma" — read it for real). DigiSmith's own repo is
D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\profiling — read the
real profiles/emma.yml there. Report which standards/ folders are
eligible for matching.
```

Expected: reports `global`, `shopify`, and `team` are all eligible (per
`emma.yml`'s real `standards` list) — even though `standards/global/`
doesn't currently exist on disk, correctly noting that as "nothing
indexed under that name to match against" rather than an error (Step 1
of the unmodified skill already handles a folder with no entries).

```bash
rm -rf /tmp/inject-standards-dogfood
```

- [ ] **Step 6: If any dogfood run in Steps 3-5 surfaced a real gap, fix it now**

If every report matched its expected outcome, skip this step. Otherwise
fix `skills/inject-standards/SKILL.md`'s wording directly, then re-run
the specific dogfood step that failed to confirm the fix.

- [ ] **Step 7: Commit**

```bash
cd D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\profiling
git add skills/inject-standards/SKILL.md
git commit -m "feat(profiling): add profile gate to inject-standards"
```

---

### Task 3: `capture-ephemeral-url` Profile Pre-Check

**Files:**
- Modify: `skills/capture-ephemeral-url/SKILL.md`

**Interfaces:**
- Consumes: `profiles/<name>.yml`'s `ephemeral` field and
  `.digismith/profile` from Task 1.
- Produces: nothing new downstream — this task only adds an early stop
  when the active profile has `ephemeral: false`, unchanged for any repo
  with no profile file.

- [ ] **Step 1: Insert a new Step 0 into `skills/capture-ephemeral-url/SKILL.md`, before the existing "### Step 1: Resolve the Ticket Key"**

```markdown
### Step 0: Profile Pre-Check

Check for `.digismith/profile` in the repo the PR was opened in.

**Missing** → unchanged, existing behavior; continue to Step 1.

**Present** → read its one-line content as the active profile name.
Locate DigiSmith's own repo — same rule `digismith:inject-standards`
uses for `standards/`: is the current working directory itself the
DigiSmith repo (`.claude-plugin/plugin.json` with
`"name": "digismith"`)? Use it directly. Otherwise ask the user for
DigiSmith's repo path this session and remember it. Read
`profiles/<name>.yml` there. No matching file → treat as stale; proceed
as if `.digismith/profile` were missing — continue to Step 1.

Otherwise, if that profile's `ephemeral` field is `false`, stop here:
report one line — "skipping ephemeral capture — `<name>` profile" — and
don't poll CI or do anything else in this skill. If `ephemeral` is
`true`, continue to Step 1 exactly as today.
```

- [ ] **Step 2: Update the Quick Reference table**

Add a new first row:

```markdown
| Step | Action |
|---|---|
| 0 | Profile pre-check: `.digismith/profile` present and its `ephemeral` is `false` → report one line and stop; otherwise (missing, stale, or `ephemeral: true`) continue |
| 1 | Resolve `<Key>` from branch name; ask if it doesn't match |
| 2 | `gh pr view --json number` for the current branch; stop if none found |
| 3 | Poll `gh pr checks` for the named check's `bucket` (ignore its exit code), ~30–60s interval, 20-min timeout |
| 4 | Fetch PR comments, take the most recent `github-actions` deploy comment, extract both URLs via the anchored regexes; fall back to raw body if either regex fails to match |
| 5 | Report both URLs (and the ticket key, if resolved) — no file write, no JIRA |
```

- [ ] **Step 3: Update Error Handling**

Add one new bullet:

```markdown
- **Active profile has `ephemeral: false`** → stop at Step 0, report one
  line, don't poll CI or attempt extraction.
```

- [ ] **Step 4: Dogfood — Personal profile skips**

```bash
mkdir -p /tmp/capture-url-dogfood/personal-repo/.digismith
echo "personal" > /tmp/capture-url-dogfood/personal-repo/.digismith/profile
```

Dispatch a subagent (Agent tool, general-purpose):

```
Follow only Step 0 ("Profile Pre-Check") of
D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\profiling\skills\capture-ephemeral-url\SKILL.md,
reasoning through this scenario: the PR was opened in
/tmp/capture-url-dogfood/personal-repo (has .digismith/profile containing
"personal" — read it for real). DigiSmith's own repo is
D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\profiling — read the
real profiles/personal.yml there. Report what Step 0 concludes, and the
exact one-line message it would report.
```

Expected: reports stopping at Step 0 with the message "skipping ephemeral
capture — personal profile", and confirms no `gh pr checks` polling would
happen.

- [ ] **Step 5: Dogfood — no profile file, unaffected**

Dispatch a subagent (Agent tool, general-purpose):

```
Follow only Step 0 ("Profile Pre-Check") of
D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\profiling\skills\capture-ephemeral-url\SKILL.md,
reasoning through this scenario: the PR was opened in
D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\profiling itself (verify
for real that .digismith/profile does not exist there). Report what Step
0 concludes.
```

Expected: reports `.digismith/profile` missing, so Step 0 is a no-op —
continues to Step 1 exactly as before this feature.

```bash
rm -rf /tmp/capture-url-dogfood
```

- [ ] **Step 6: If either dogfood run in Steps 4-5 surfaced a real gap, fix it now**

If both reports matched their expected outcome, skip this step.
Otherwise fix `skills/capture-ephemeral-url/SKILL.md`'s wording directly,
then re-run the specific dogfood step that failed to confirm the fix.

- [ ] **Step 7: Commit**

```bash
cd D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\profiling
git add skills/capture-ephemeral-url/SKILL.md
git commit -m "feat(profiling): add profile pre-check to capture-ephemeral-url"
```

---

### Task 4: `report-implementation` Scoped Ticket Field

**Files:**
- Modify: `skills/report-implementation/SKILL.md`

**Interfaces:**
- Consumes: `profiles/<name>.yml`'s `ticket` field and
  `.digismith/profile` from Task 1; `.digismith/docs/<feature-slug>/ticket.md`
  (already located via the existing `<feature-slug>` derivation in Step
  1) if it exists.
- Produces: a new optional `{{TICKET_KEY_META}}` placeholder in the
  report's header meta — nothing else about the report changes.

Today's `report-implementation` has no ticket-key field anywhere in its
template — every report so far has been for a DigiSmith-own-repo feature
with no JIRA ticket at all, so this gap was never hit. This task adds the
field for the first time (purely additive — no existing report or
behavior regresses), gated so it only ever appears when a real ticket key
is derivable **and** the active profile (if any) doesn't say `ticket:
false`.

- [ ] **Step 1: Add ticket-key derivation to Step 1 ("Locate and Read Sources")**

Add this as a new final paragraph of Step 1, after its existing "If no
ledger exists at that path, stop here entirely" line and before the "If
the ledger has no `Final review (...)` line" paragraph:

```markdown
5. **Ticket key (optional):** using the same `<feature-slug>` already
   derived above, check whether
   `.digismith/docs/<feature-slug>/ticket.md` exists and has a
   `**Key:**` line. If so, note that key for Step 2a. Then check for
   `.digismith/profile` in the repo currently being worked in (the same
   repo `<feature-slug>` lives in). Missing → the derived key (if any)
   is used as-is in Step 2a. Present → read its one-line content as the
   active profile name, locate DigiSmith's own repo (same rule
   `digismith:inject-standards` uses for `standards/`: current working
   directory has `.claude-plugin/plugin.json` with
   `"name": "digismith"` → use it directly; otherwise ask the user for
   the path and remember it), and read `profiles/<name>.yml` there. No
   matching file → treat as stale, use the derived key (if any) as-is,
   same as "missing". Otherwise, if that profile's `ticket` field is
   `false`, discard the derived key entirely for Step 2a regardless of
   whether `ticket.md` had one — the ticket-key meta span is omitted.
```

- [ ] **Step 2: Add `{{TICKET_KEY_META}}` to Step 2a's placeholder list**

Add this bullet to Step 2a ("Header-level placeholders"), after the
existing `{{MAP_ITEM}}` bullet:

```markdown
- **`{{TICKET_KEY_META}}`** — from Step 1.5: if a ticket key survived
  that step's profile gate, this is literally
  `<span>Ticket: <strong><Key></strong></span>` with the real key
  substituted (escaped per Step 2f, though a JIRA key like `EMKT-9001`
  never actually needs it). If no key survived (no `ticket.md`, no
  `**Key:**` line in it, or the active profile has `ticket: false`),
  this is the empty string — the span is omitted entirely, not rendered
  blank.
```

- [ ] **Step 3: Insert `{{TICKET_KEY_META}}` into the template's header meta block in Step 3**

Change:

```html
  <div class="meta">
    <span>Date: {{DATE}}</span>
    <span>Map item: <strong>{{MAP_ITEM}}</strong></span>
    <span>Commit range: <code>{{MERGE_BASE_SHORT}}..{{HEAD_SHORT}}</code></span>
  </div>
```

to:

```html
  <div class="meta">
    <span>Date: {{DATE}}</span>
    <span>Map item: <strong>{{MAP_ITEM}}</strong></span>
    {{TICKET_KEY_META}}
    <span>Commit range: <code>{{MERGE_BASE_SHORT}}..{{HEAD_SHORT}}</code></span>
  </div>
```

- [ ] **Step 4: Update the Quick Reference table's Step 1 and Step 2 rows**

Change the Step 1 row to:

```markdown
| 1 | Locate ledger + plan; derive `<feature-slug>` (parent dir when the plan is at `.digismith/docs/<slug>/plan.md`, else parse it out of the `<date>-<slug>-plan.md` filename); compute commit range; `git log --reverse --oneline`; check for an optional ticket key gated by the active profile's `ticket` field; skip entirely if no ledger, ask if no final-review line |
```

Change the Step 2 row to:

```markdown
| 2 | Derive header placeholders including the optional `{{TICKET_KEY_META}}` (2a), per-task rows (2b), final-review findings (2c), delivered cards (2d), oldest-first commits (2e); escape all ledger/plan text (2f) |
```

- [ ] **Step 5: Dogfood — ticket key shown (no profile file, ticket.md has a Key)**

```bash
mkdir -p "/tmp/report-impl-ticket-dogfood/.digismith/docs/fake-feature"
cat > "/tmp/report-impl-ticket-dogfood/.digismith/docs/fake-feature/ticket.md" << 'EOF'
# Fake Feature

**Key:** EMKT-4242
**Story Points:** 3

## Description

...

## Acceptance Criteria

- ...
EOF
```

Dispatch a subagent (Agent tool, general-purpose):

```
Follow only the new Step 1.5 ("Ticket key (optional)") of
D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\profiling\skills\report-implementation\SKILL.md,
reasoning through this scenario: <feature-slug> is "fake-feature", and
the repo being worked in is /tmp/report-impl-ticket-dogfood (has
.digismith/docs/fake-feature/ticket.md with a real Key line — read it for
real; has no .digismith/profile file — verify for real). Report what key
(if any) survives for Step 2a, and what {{TICKET_KEY_META}} would render
as.
```

Expected: reports the key `EMKT-4242` survives (no profile file → used
as-is), and `{{TICKET_KEY_META}}` renders as
`<span>Ticket: <strong>EMKT-4242</strong></span>`.

- [ ] **Step 6: Dogfood — ticket key discarded (Personal profile, ticket.md has a Key anyway)**

```bash
echo "personal" > "/tmp/report-impl-ticket-dogfood/.digismith/profile"
```

Dispatch a subagent (Agent tool, general-purpose):

```
Follow only the new Step 1.5 ("Ticket key (optional)") of
D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\profiling\skills\report-implementation\SKILL.md,
reasoning through this scenario: <feature-slug> is "fake-feature", and
the repo being worked in is /tmp/report-impl-ticket-dogfood (has
.digismith/docs/fake-feature/ticket.md with a real Key line, AND now has
.digismith/profile containing "personal" — read both for real). DigiSmith's
own repo is D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\profiling —
read the real profiles/personal.yml there. Report what key (if any)
survives for Step 2a, and what {{TICKET_KEY_META}} would render as.
```

Expected: reports the key is discarded (personal profile's `ticket` is
`false`), and `{{TICKET_KEY_META}}` renders as the empty string.

```bash
rm -rf /tmp/report-impl-ticket-dogfood
```

- [ ] **Step 7: Dogfood — no ticket.md at all (today's real DigiSmith-repo case), no regression**

Dispatch a subagent (Agent tool, general-purpose):

```
Follow only the new Step 1.5 ("Ticket key (optional)") of
D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\profiling\skills\report-implementation\SKILL.md,
reasoning through this scenario: <feature-slug> is "profiling", and the
repo being worked in is
D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\profiling itself. Verify
for real whether .digismith/docs/profiling/ticket.md exists (it should
not — this is DigiSmith's own repo building its own feature, which never
goes through digismith:jira-intake). Report what key (if any) survives
for Step 2a, and what {{TICKET_KEY_META}} would render as.
```

Expected: reports no `ticket.md` exists, so no key survives regardless of
profile state, and `{{TICKET_KEY_META}}` renders as the empty string —
confirming this task's own eventual implementation report (generated
automatically once this plan's final review passes) renders exactly as
every prior DigiSmith report has, with no regression.

- [ ] **Step 8: If any dogfood run in Steps 5-7 surfaced a real gap, fix it now**

If every report matched its expected outcome, skip this step. Otherwise
fix `skills/report-implementation/SKILL.md`'s wording directly, then
re-run the specific dogfood step that failed to confirm the fix.

- [ ] **Step 9: Commit**

```bash
cd D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\profiling
git add skills/report-implementation/SKILL.md
git commit -m "feat(profiling): add scoped ticket-key field to report-implementation"
```

---

### Task 5: Update `.digismith/history.html` and `MEMORY.md` for Map Item O

**Files:**
- Modify: `.digismith/history.html`
- Modify: `MEMORY.md`

**Interfaces:**
- Consumes: nothing structural — documentation update reflecting Tasks
  1-4's completed work.
- Produces: an up-to-date living tracker.

- [ ] **Step 1: Add map item O to `.digismith/history.html`'s map table**

Add a new row immediately after the existing **N** row (currently ending
at the closing `</tr>` right before `</table>` in the `#map` section):

```html
    <tr><td><strong>O</strong></td><td>Profiling</td>
      <td>A per-repo behavior profile (standards subset, ticket/ephemeral/reporting on-off) that existing stages consult independently at their own trigger point</td>
      <td><span class="status done">Done</span></td></tr>
```

Add a new descriptive paragraph after the existing N paragraph (after its
closing `</p>`, before `</section>`):

```html
  <p style="font-size:.88rem; color:var(--muted);">
    <strong>O — Profiling:</strong>
    <a href="docs/profiling/design.html">design spec</a> ·
    <a href="docs/profiling/plan.md">implementation plan</a> ·
    <a href="docs/profiling/report.html">implementation report</a>
  </p>
```

- [ ] **Step 2: Update the Progress Overview stats**

Change:

```html
    <div class="stat"><div class="n">4 / 14</div><div class="l">map items shipped</div></div>
```

to:

```html
    <div class="stat"><div class="n">5 / 15</div><div class="l">map items shipped</div></div>
```

(O is a 5th done item alongside A, G, M, and N, and a 15th map item.)

- [ ] **Step 3: Update the Build Order (`#tiers`) Tier 1 row**

Change:

```html
    <tr><td><strong>1</strong></td><td>The frame</td>
      <td><strong>G</strong> standards injection <span class="status done">Done</span> · <strong>E</strong> spine <span class="status next">In progress</span></td>
      <td><span class="status next">In progress — both items underway (1 done, 1 partial)</span></td></tr>
```

to:

```html
    <tr><td><strong>1</strong></td><td>The frame</td>
      <td><strong>G</strong> standards injection <span class="status done">Done</span> · <strong>E</strong> spine <span class="status next">In progress</span> · <strong>O</strong> profiling <span class="status done">Done</span></td>
      <td><span class="status next">In progress — 2 of 3 items done (G, O), E in progress</span></td></tr>
```

- [ ] **Step 4: Add a timeline entry**

Append to the `.timeline` div, after its existing final entry:

```html
    <div class="event">
      <div class="date">2026-08-11</div>
      <h4>O brainstormed, specced, and built — 4 tasks, subagent-driven-development</h4>
      <p>Jack asked to make DigiSmith's existing "everything on" Emma flow and a
      lighter Personal flow (no ticket, no ephemeral capture) a declared per-repo
      choice instead of an undocumented, ad hoc deviation from pillar 5's
      prescriptive stance. Two flat YAML profiles ship
      (<code>emma</code>, <code>personal</code>), read independently by
      <code>using-digismith</code>, <code>inject-standards</code>,
      <code>capture-ephemeral-url</code>, and <code>report-implementation</code> at
      each one's own trigger point — no central orchestrator, no
      inheritance system. A repo with no <code>.digismith/profile</code> file sees
      zero behavior change, including DigiSmith's own repo. Task 4 also closed a
      standing gap: <code>report-implementation</code> had never rendered a
      ticket-key field at all until this feature added one, gated by the same
      profile mechanism.</p>
    </div>
```

- [ ] **Step 5: Update `MEMORY.md`'s map table**

Add a new row after the existing **N** row:

```markdown
| **O** | Profiling | A per-repo behavior profile (standards subset, ticket/ephemeral/reporting on-off) that existing stages consult independently at their own trigger point — new letter, added directly per Jack's request during this brainstorm |
```

- [ ] **Step 6: Update `MEMORY.md`'s Build order Tier 1 row**

Change:

```markdown
| **1** | The frame | **G** standards injection · **E** spine |
```

to:

```markdown
| **1** | The frame | **G** standards injection · **E** spine · **O** profiling (pulled forward and built 2026-08-11) |
```

- [ ] **Step 7: Commit**

```bash
cd D:\Workspace\Jazurite\DigiSmith\.claude\worktrees\profiling
git add .digismith/history.html MEMORY.md
git commit -m "docs: update history — profiling (O) shipped"
```

---

**After Task 5's final review passes:** per `MEMORY.md`'s Conventions
("Every `subagent-driven-development` plan invokes
`digismith:report-implementation`"), invoke `digismith:report-implementation`
before this plan's ledger is deleted — Task 7 of its own dogfood in Task
4 above already confirmed this run's own report will render with no
ticket-key field and no regression, same shape as every DigiSmith report
so far.
