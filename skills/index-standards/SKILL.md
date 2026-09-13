---
name: index-standards
description: Use when standards files were added, edited, or deleted under DigiSmith's standards/ folder and index.yml needs rebuilding or syncing, or when inject-standards suggestions seem stale or wrong.
---

# Index Standards

## Overview

Rebuilds `standards/index.yml`, the lookup table `digismith:inject-standards`
uses to match relevant standards without reading every file. Maps each
standard to a one-line description.

## When to Use

- After `digismith:discover-standards` or `digismith:add-standards` create
  or edit files (they call this skill automatically as their last step —
  you don't normally invoke it directly for that case)
- After manually creating, editing, or deleting files under `standards/`
- If `digismith:inject-standards` suggestions seem out of sync with what's
  actually in `standards/`
- To clean up a stale or messy index

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
- **Content-changed files** — already indexed, but the file's content no
  longer matches what the existing description implies (this includes
  files `digismith:add-standards` or `digismith:discover-standards`
  appended to rather than created fresh)
- **Unchanged files** — already indexed, content matches, keep as-is

### Step 4: Handle New and Content-Changed Files

For each new or content-changed file, read it and use `AskUserQuestion`
to propose a one-line description:

```
New standard needs indexing:
  File: team/branch-naming.md

Suggested description: "Branch naming convention for Emma tickets"

Accept? (yes / or type a better description)
```

For a content-changed file, propose an updated description that reflects
what changed — don't default to keeping the old one:

```
Standard content changed, description may need updating:
  File: team/docs-conventions.md

Current description: "Documentation file structure and gitignore conventions"
Suggested description: "Documentation file structure, gitignore conventions, and Jira copy-over process"

Accept the updated description? (yes / or type a better one)
```

Keep descriptions to one short sentence — they're for matching, not
documentation.

For a new file, also check whether it needs either new optional field before moving on: propose
`kind: prose` when the file is prose style/writing guidance rather than a code pattern or process
convention, and propose a `companions:` list when the file's own content references sibling files
in the same folder by path. Both are proposals the user confirms alongside the description, not
automatic — same disposition as the description suggestion itself.

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
- Two optional fields, in this order when present: `kind: prose` (marks writing-style guidance,
  excluded from `inject-standards`' Scenario 4 entirely) and `companions: [name, ...]` (sibling
  files always injected alongside this one). Both omitted entirely for an entry that doesn't need
  them — never write `kind:` or `companions:` as an empty value.

Example:
```yaml
root:
  general-principles:
    description: Universal coding principles that apply regardless of stack

global:
  error-handling:
    description: Error handling conventions across any language
  writing-style-example:
    kind: prose
    companions: [writing-style-example-glossary]
    description: Example entry showing the optional kind/companions fields (not a real standard)

shopify:
  custom-element-components:
    description: Custom element base-class pattern for interactive theme components

team:
  branch-naming:
    description: Branch naming convention for Emma tickets
  commit-style:
    description: Commit message format and scope conventions
```

### Step 7: Report

```
Index updated:
  2 new entries added
  1 entry refreshed (content changed)
  1 stale entry removed
  8 entries unchanged

Total: 11 standards indexed
```

## Output

Writes `standards/index.yml`.
