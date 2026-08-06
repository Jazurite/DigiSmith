---
name: add-standards
description: Use when the user wants to manually add, dictate, or record a coding standard or convention directly rather than extract it from a codebase — phrases like "add a standard", "always do X", "make this a rule", "document this convention".
---

# Add Standards

## Overview

Manual-entry counterpart to `digismith:discover-standards`. The user
dictates a rule directly ("always use Shopify sections, never templates")
instead of it being extracted from code. Drafts the standard, confirms,
writes the file, then hands off to `digismith:index-standards`.

## When to Use

The user states a rule, convention, or preference they want captured for
future subagent briefs — without asking you to go analyze a codebase for
it. If they instead want you to look at existing code and infer patterns,
use `digismith:discover-standards` instead.

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

Invoke the `digismith:index-standards` skill so the new/updated file gets indexed.

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
| 1 | Capture the user's stated rule, clarify if ambiguous |
| 2 | Pick `global/` or `shopify/`, check for an existing file to append to |
| 3 | Draft, confirm via `AskUserQuestion` |
| 4 | Write `standards/<folder>/<name>.md` |
| 5 | Invoke `digismith:index-standards` |
