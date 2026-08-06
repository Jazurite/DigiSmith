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
