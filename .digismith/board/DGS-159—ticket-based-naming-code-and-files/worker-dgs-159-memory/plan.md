# MEMORY.md Restructure (DGS-159 Part 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `MEMORY.md` at the repo root so it reflects ticket-based naming (DGS-158):
the old clan-letter map, build order, and open questions move verbatim into one frozen,
historical section, and new sections explain where work is tracked now. Update one line in
`skills/handoff/SKILL.md` to match.

**Architecture:** A single Python pass reads `MEMORY.md`'s current lines, slices out the
sections that stay in place from the sections that move, reassembles the file in the new order,
and self-verifies the moved sections are byte-for-byte unchanged before writing. No code, no
test suite — the "tests" here are diff-based verification of a markdown file.

**Tech Stack:** `python3` (stdlib only), `git diff --color-moved` for human verification.

## Global Constraints

- Every word currently in The Map, Build Order, and Open Questions sections of `MEMORY.md` is
  copied verbatim — not reworded, not reordered within itself, not deleted. Enforced by having
  the script slice the original lines directly rather than retype them, plus a self-check before
  writing.
- The opening paragraph of `MEMORY.md` (lines 1–6) is not edited. A new status block is inserted
  after it instead.
- Philosophy, Structure, What Superpowers Already Covers, and Relationship to `2. Career/` are
  not edited at all (including their own inline references to map letters, e.g. **C**, **Tier
  6**, **O**, **P** — those stay resolvable via the frozen section).
- Conventions is not edited except for one new bullet appended at its end.
- `skills/report-implementation/SKILL.md` is not touched.
- Nothing outside `MEMORY.md` and the one named line in `skills/handoff/SKILL.md` is modified.
- Commit after each task.

---

### Task 1: Restructure `MEMORY.md`

**Files:**
- Modify: `MEMORY.md` (repo root)

**Interfaces:** None (markdown content only).

- [ ] **Step 1: Confirm current section boundaries haven't drifted**

Run this and confirm the output matches exactly (these are the anchor points the transform
script below depends on):

```bash
grep -n '^## ' MEMORY.md
```

Expected:
```
8:## Philosophy
48:## Structure
84:## What Superpowers already covers
92:## The map
129:## Build order
153:## Relationship to `2. Career/`
179:## Open questions
204:## Conventions
```

If this doesn't match exactly, stop — the line numbers hardcoded in Step 2's script are wrong
and need re-deriving before continuing.

- [ ] **Step 2: Run the restructure script**

```bash
python3 - <<'PYEOF'
path = "MEMORY.md"
with open(path, encoding="utf-8") as f:
    lines = f.readlines()

def seg(a, b):  # 1-indexed, inclusive
    return lines[a - 1:b]

# Guard against drift (matches Step 1's confirmed headings)
assert lines[91] == "## The map\n", lines[91]
assert lines[128] == "## Build order\n", lines[128]
assert lines[178] == "## Open questions\n", lines[178]
assert lines[203] == "## Conventions\n", lines[203]
assert len(lines) == 279, len(lines)

opening = seg(1, 7)          # title + paragraph + trailing blank
core = seg(8, 91)            # Philosophy, Structure, What Superpowers (ends w/ blank)
map_body = seg(94, 127)      # The map, body only (no heading/leading blank)
buildorder_body = seg(131, 151)  # Build order, body only
relationship = seg(153, 178)     # ends w/ blank
openq_body = seg(181, 202)       # Open questions, body only
conventions = seg(204, 279)      # EOF, no trailing blank

status_block = (
    "**Status, 2026-10-04:** the map and build order below are a frozen snapshot; for what is\n"
    "tracked now, see \"Where work is tracked now\" below.\n"
    "\n"
    "## Where work is tracked now\n"
    "\n"
    "Tickets, not clan letters, are the unit of work (DGS-158, adopted 2026-10-04). ClickUp is the\n"
    "source of truth for what's active and what's planned — this file no longer tracks either. A\n"
    "ticket's working files live in `.digismith/board/<KEY>—<slug>/`; session files live in\n"
    "`.digismith/sessions/`. No new letter or lineage number gets assigned to anything, ever again.\n"
    "Shipped work is recorded automatically in `.digismith/history.html` by the history hook, not by\n"
    "hand here. The clan-letter map near the end of this file is a frozen snapshot of everything built\n"
    "before this cutover — read it for historical context, never extend it.\n"
    "\n"
)

new_bullet = (
    "\n"
    "- **Ticket-based board & session convention** (adopted 2026-10-04, DGS-158/DGS-159): tickets are\n"
    "  the unit of work, not clan letters or lineage numbers. See DGS-158's `design.html`, today at\n"
    "  `.digismith/docs/E/E.3/worker-maestro-conventions/` (it moves under DGS-164).\n"
)

open_questions_current = (
    "\n"
    "## Open questions (current)\n"
    "\n"
    "- **F's shape** — still undecided: whether design review is present-for-human-review only,\n"
    "  independent agent critique only, or critique then present. Unaffected by ticket-based naming;\n"
    "  decide when Tier 6 gets picked up. No ClickUp ticket yet. See the frozen entry below for the\n"
    "  original wording.\n"
    "- **`{{MAP_ITEM}}` derivation gap** — `report-implementation`'s placeholder has no rule for a\n"
    "  no-map-letter feature. This belongs to `report-implementation` itself, which a later part of\n"
    "  DGS-159 updates for ticket-based naming. See the frozen entry below for the original wording.\n"
    "- **Shipped-product telemetry** — still undesigned and unscoped. Simplified by ticket-based\n"
    "  naming: it needs no map letter at all, just a ClickUp ticket whenever it's wanted (none exists\n"
    "  yet). See the frozen entry below for the original wording.\n"
)

frozen_open = (
    "\n"
    "## Frozen: the clan-letter map (through DGS-157)\n"
    "\n"
    "Recorded through 2026-10-03, before ticket-based naming (DGS-158/159). Nothing below is edited,\n"
    "extended, or reworded — see \"Where work is tracked now\" near the top of this file for what\n"
    "replaced it, and \"Open questions (current)\" above for live restatements of the three items below.\n"
    "\n"
    "### The map\n"
    "\n"
)
mid1 = "\n### Build order\n\n"
mid2 = "\n### Open questions\n\n"

out = []
out += opening
out.append(status_block)
out += core
out += relationship
out += conventions
out += new_bullet
out += open_questions_current
out.append(frozen_open)
out += map_body
out.append(mid1)
out += buildorder_body
out.append(mid2)
out += openq_body

# Self-check: the three frozen bodies are byte-for-byte what was sliced from the original file
new_text = "".join(out)
assert "".join(map_body) in new_text
assert "".join(buildorder_body) in new_text
assert "".join(openq_body) in new_text

with open(path, "w", encoding="utf-8") as f:
    f.writelines(out)

print("wrote", path, "-", len(out), "lines (raw list, not final line count)")
PYEOF
```

- [ ] **Step 3: Verify the frozen sections moved, not edited**

```bash
git diff --color-moved=blocks MEMORY.md
```

Expected: the old `## The map` / `## Build order` / `## Open questions` content is flagged as
**moved** (not deleted+re-added with any textual difference) once relocated under the new
`### The map` / `### Build order` / `### Open questions` headings. If any line inside those
three bodies shows as a plain addition/deletion (not a move), stop — something was reworded and
that breaks the immutability rule.

- [ ] **Step 4: Verify the new heading set**

```bash
grep -n '^## \|^### ' MEMORY.md
```

Expected eight `##` headings in this order — Philosophy, Structure, What Superpowers already
covers, Where work is tracked now, Relationship to `` `2. Career/` ``, Conventions, Open
questions (current), Frozen: the clan-letter map (through DGS-157) — plus three `###` headings
inside the last one: The map, Build order, Open questions.

- [ ] **Step 5: Read the diff once, by eye, for the three new/changed text blocks**

```bash
git diff MEMORY.md | less
```

Confirm by eye: the status block, the "Where work is tracked now" section, the new Conventions
bullet, and the "Open questions (current)" section read exactly as drafted in
`design.html` sections 4, 5, 6, and 7.

- [ ] **Step 6: Commit**

```bash
git add MEMORY.md
git commit -m "docs(dgs-159): restructure MEMORY.md for ticket-based naming"
```

---

### Task 2: Update `skills/handoff/SKILL.md` line 116

**Files:**
- Modify: `skills/handoff/SKILL.md:115-116`

**Interfaces:** None.

- [ ] **Step 1: Confirm the current text matches exactly**

```bash
sed -n '114,117p' skills/handoff/SKILL.md
```

Expected:
```
   - Check each item that applies here:
     - DigiSmith's own repo (`.claude-plugin/plugin.json` names `digismith`): this session's row
       in `MEMORY.md` records this ticket.
     - The ticket is a ClickUp task (a `DGS-` key): its progress comment for this checkpoint is
```

If this doesn't match, stop and re-locate the exact lines before editing.

- [ ] **Step 2: Replace the two lines**

Old (lines 115–116):
```
     - DigiSmith's own repo (`.claude-plugin/plugin.json` names `digismith`): this session's row
       in `MEMORY.md` records this ticket.
```

New:
```
     - DigiSmith's own repo (`.claude-plugin/plugin.json` names `digismith`): `.digismith/history.html`
       records this ticket (the history hook writes it from the ticket's `report.html`; a ticket
       with no report has no entry, which is a gap to list).
```

Use the Edit tool (or equivalent exact string replace) rather than a line-numbered `sed -i`, so
the change is verified against the exact surrounding text rather than a position that could have
shifted.

- [ ] **Step 3: Verify nothing else in the file changed**

```bash
git diff skills/handoff/SKILL.md
```

Expected: exactly one hunk, replacing the two old lines with the three new lines. No other line
touched.

- [ ] **Step 4: Verify no other file under `skills/` changed**

```bash
git status --short
```

Expected: only `skills/handoff/SKILL.md` and (from Task 1) `MEMORY.md` show as modified — no
other skill file.

- [ ] **Step 5: Commit**

```bash
git add skills/handoff/SKILL.md
git commit -m "docs(dgs-159): point handoff's MEMORY.md check at history.html"
```
