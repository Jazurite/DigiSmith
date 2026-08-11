---
name: inject-standards
description: Use when relevant coding standards need to be pulled into the current context — before writing code, building a new DigiSmith skill, brainstorming or planning, or about to dispatch an implementer subagent via the Agent tool.
---

# Inject Standards

## Overview

Reads `standards/index.yml`, matches relevant standards against the
current work, and folds them into context — formatted differently
depending on which of four scenarios is in play.

## Locating the Standards Library

`standards/` always means DigiSmith's own repo, never a path relative to
the current working directory.

Resolve it in order:
1. Is the current working directory itself the DigiSmith repo (has
   `.claude-plugin/plugin.json` with `"name": "digismith"`)? Use it
   directly.
2. Otherwise, ask the user for DigiSmith's repo path this session and
   remember it for the rest of the conversation.

Never read or write `standards/` under a plugin cache path (e.g.
`~/.claude/plugins/cache/.../digismith/<version>/`) — that is a stale,
version-locked snapshot, not the live repo. Writes there are silently
lost on the next plugin update.

## Usage Modes

**Auto-suggest** (no target named) — analyze context, suggest matches.

**Explicit** (folder or file named) — skip suggestion, inject directly,
still validate the target exists.

## Process

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
this invocation only — `digismith:using-digismith`'s own Step 0 is where
a stale pointer actually gets corrected, this skill doesn't rewrite
`.digismith/profile` itself.

Otherwise, only folders named in that profile's `standards` list are
eligible for matching in every scenario (1-4) below — an empty list
means skip straight to "proceed without a Standards section," same as
the existing zero-standards-exist path. This gate applies uniformly to
every `standards/` subfolder, `global/` included — the "`global/` never
has a repo-type gate" statement in Step 3 refers only to the Shopify-repo
auto-include check below, not to this profile gate.

### Step 1: Check the Index Exists

Read `standards/index.yml`. If it doesn't exist:

```
No standards index found. Run digismith:discover-standards or
digismith:add-standards first, or digismith:index-standards if standards
files exist without an index.
```

Stop here if missing — except in Scenario 4 (Dispatching a Subagent),
where you proceed without a `## Standards` section instead of blocking
the dispatch (see Scenario 4 below).

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

### Step 3: Detect Shopify-Repo Layers (Scenario 4 auto-include gate)

`standards/` has three folders on two independent axes: *scope* (`global/`
= universal, `shopify/` + `team/` = Emma-specific) and *kind* (`shopify/`
= technical/code patterns, `team/` = process conventions with no code
aspect). This detection check applies to both Emma-specific folders
(`shopify/` and `team/`) equally — it only decides whether Scenario 4 may
auto-include them without asking. It is not a filter on which standards
are eligible for matching in the first place — in Scenarios 1-3, `shopify/`
and `team/` standards are matched by content relevance against
`index.yml` descriptions exactly like any other standard, regardless of
the current working repo's identity. `global/` never has a repo-type gate
of any kind, in any scenario.

The current working repo qualifies for `shopify/` + `team/` auto-include
if either is true:
- `docs/development-workflow.md` exists at the repo root, or
- the repo name matches `shopify-template-*`

Scenarios 1-3: surface `shopify/` and `team/` matches as ordinary
suggestions the user confirms, same as anything else — content relevance
only, never gated by this repo check. Scenario 4: if the repo qualifies,
auto-include matched `shopify/` and `team/` standards without asking.

If the repo qualifies but `standards/shopify/` or `standards/team/` is
empty or doesn't exist, silently skip whichever is empty — there's
nothing to inject, and this is not an error. The same goes for
`standards/global/`: it has no repo-type gate, so if it's empty or
doesn't exist there's simply nothing indexed to match against — also not
an error.

### Step 4: Match and Suggest (skip in Explicit Mode)

Match `index.yml` descriptions against the current work context. Present
2-5 suggestions via `AskUserQuestion`:

```
Based on your task, these standards may be relevant:

1. team/branch-naming — Branch naming convention for Jira tickets
2. global/error-handling — Error handling conventions across any language

Inject these? (yes / just 1 / add: team/commit-style / none)
```

### Step 5: Parse Explicit Targets (Explicit Mode only)

Arguments can be a folder (`team` → all files in it), a folder/file
(`team/branch-naming` → one file), or `root`/`root/<file>` for files
directly in `standards/`. If a named target doesn't exist:

```
Standard not found: team/nonexistent

Available standards in team/:
- branch-naming
- commit-style
- docs-conventions

Did you mean one of these?
```

### Step 6: Inject, Formatted for the Scenario

**Scenario 1 — Conversation.** Read the standards and announce them
inline:

```
I've read the following standards as relevant to what we're working on:

--- Standard: team/branch-naming ---
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

@standards/team/branch-naming.md
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

--- Standard: team/branch-naming ---
[full file content]
--- End Standard ---

--- Standard: shopify/custom-element-components ---
[full file content]
--- End Standard ---
```

If zero standards exist anywhere (fresh install), proceed without a
`## Standards` section rather than blocking the dispatch — this skill
augments the brief, it doesn't gate dispatch.

## Quick Reference

| Step | Action |
|---|---|
| 0 | Profile gate: `.digismith/profile` present → only its `standards` list's folders are eligible below; missing → unchanged, all folders eligible |
| 1 | Read `standards/index.yml`, stop if missing (except Scenario 4 — proceed without standards instead) |
| 2 | Detect scenario (1-4), ask if ambiguous |
| 3 | Detect Shopify-repo layers (2 signals) — gates `shopify/` + `team/` for Scenario 4's auto-include only, never a filter in Scenarios 1-3; `global/` is never gated |
| 4 | Match + suggest (skip if explicit target given) |
| 5 | Parse explicit target if given, validate it exists |
| 6 | Inject formatted for the scenario |
