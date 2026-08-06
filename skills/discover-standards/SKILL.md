---
name: discover-standards
description: Use when the user wants to extract coding standards or conventions from an existing codebase into DigiSmith's standards library — mentions capturing tribal knowledge, house rules, or consistent patterns already present in real code.
---

# Discover Standards

## Overview

Extracts tribal knowledge from a codebase into concise, documented
standards under `standards/global/`, `standards/shopify/`, or
`standards/team/`. One standard completes the full ask-why → draft →
confirm → write loop before the next one starts — never batch multiple
standards through the loop at once.

## When to Use

The user wants existing code analyzed for patterns worth documenting. If
they're instead dictating a rule directly with no codebase analysis
needed, use `digismith:add-standards` instead.

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

Two independent axes decide the folder: *scope* (universal vs.
Shopify/Emma-specific) and *kind* (a coding technique vs. a team/process
convention with no code aspect):

- `standards/global/` — universal principles, any stack
- `standards/shopify/` — Shopify/Liquid/Emma-theme *technical* patterns
  (code-level: components, asset loading, etc.)
- `standards/team/` — Emma team/process conventions with no coding-technique
  aspect (branch naming, commit style, docs layout, etc.) — code analysis
  rarely surfaces these directly, but a pattern you find (e.g. a commit
  history convention) may belong here instead of `shopify/`

Check for an existing related file first — append rather than create a
duplicate if one exists. Write `standards/<folder>/<name>.md`.

Then repeat Steps 3-4 for the next selected standard.

### Step 5: Trigger Indexing

Once all selected standards for this area are written, invoke the
`digismith:index-standards` skill.

### Step 6: Offer to Continue

```
Standards created for [area]:
- shopify/custom-element-components.md
- team/commit-style.md

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
- **State the why briefly, when it's not obvious** — a short `**Why:**`
  line (and `**Exception:**` / `**Common mistake:**` if relevant) beats
  folding the reasoning into prose

## Quick Reference

| Step | Action |
|---|---|
| 1 | Determine focus area (ask if not specified) |
| 2 | Read representative files, present findings |
| 3 | Per standard: ask why → draft → confirm |
| 4 | Write to `global/`, `shopify/`, or `team/`, check for append-vs-duplicate |
| 5 | Invoke `digismith:index-standards` |
| 6 | Offer to continue with another area |
