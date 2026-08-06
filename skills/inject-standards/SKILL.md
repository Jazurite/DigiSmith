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

### Step 3: Detect Shopify-Repo Layer (Scenario 4 auto-include gate)

This check only decides whether Scenario 4 may auto-include `shopify/`
standards without asking. It is not a filter on which standards are
eligible for matching in the first place — in Scenarios 1-3, `shopify/`
standards are matched by content relevance against `index.yml`
descriptions exactly like any other standard, regardless of the current
working repo's identity.

The current working repo qualifies for `shopify/` auto-include if either
is true:
- `docs/development-workflow.md` exists at the repo root, or
- the repo name matches `shopify-template-*`

Scenarios 1-3: surface `shopify/` matches as ordinary suggestions the user
confirms, same as anything else — content relevance only, never gated by
this repo check. Scenario 4: if the repo qualifies, auto-include matched
`shopify/` standards without asking.

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
| 3 | Detect Shopify-repo layer (2 signals) — gates only Scenario 4's auto-include, never a filter in Scenarios 1-3 |
| 4 | Match + suggest (skip if explicit target given) |
| 5 | Parse explicit target if given, validate it exists |
| 6 | Inject formatted for the scenario |
