# Screenshots/Videos Section (Q.1 addendum) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use digismith:subagent-driven-development (recommended) or digismith:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 🖼️ Screenshots / Videos section to the Progress Update template, always reporting `N/A` for now since real image attachment depends on map item I.5 (owned separately, not built here).

**Architecture:** Two file edits, no new files, no code. `progress-update.md` gains one new section between "All links" and "Next Steps". `generate-comment/SKILL.md`'s Step 2 gains one instruction setting the new `screenshots` placeholder to the literal string `N/A`.

**Tech Stack:** Plain Markdown (template) and a Markdown agentic-instructions file (skill) — no TypeScript, no tests to run. Matches this repo's existing precedent that SKILL.md-only changes have no automated test cycle (verification stays manual/live, same disposition as the original Q.1 build's Task 3).

## Global Constraints

- The `screenshots` placeholder is always `N/A` — no question asked to the user about screenshots this round. Real image support is out of scope, deferred to map item I.5.
- The `<date>` placeholder's existing `D/M` computation (`date +%-d/%-m`) is untouched — already correct, per the design addendum.
- Design reference: `.digismith/docs/generate-comment/design.html`, section "Addendum: Screenshots/Videos section (2026-09-18)".

---

## Task 1: Add the Screenshots/Videos section

**Files:**
- Modify: `skills/generate-comment/templates/progress-update.md` (full file, 13 lines today)
- Modify: `skills/generate-comment/SKILL.md` (Step 2, and the Quick Reference table)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new for other consumers — the `screenshots` placeholder is purely internal to this template/skill pair; `fill-template.ts` already handles arbitrary placeholder keys generically, no change needed there.

This is an agentic-instructions + data-template change, not code — there is no automated test cycle for it (matching the original Q.1 build's Task 3 disposition). The steps below are "make the edit, read it back, commit," not TDD.

- [ ] **Step 1: Edit `skills/generate-comment/templates/progress-update.md`**

Replace the file's full current content:

```markdown
### 📣 Progress Update – <date>

---

#### ✅ What's done

<whats-done>

👆 All links (Preview Theme, Customize, Pull Request) are in the ticket description above.

#### 🎯 Next Steps:

<next-steps>
```

With this (one new section inserted between the "All links" line and "Next Steps"):

```markdown
### 📣 Progress Update – <date>

---

#### ✅ What's done

<whats-done>

👆 All links (Preview Theme, Customize, Pull Request) are in the ticket description above.

🖼️ Screenshots / Videos:

<screenshots>

#### 🎯 Next Steps:

<next-steps>
```

- [ ] **Step 2: Edit `skills/generate-comment/SKILL.md`'s Step 2 (Gather Content — Progress Update)**

Find this paragraph (the one ending the mention-resolution/bullet-drafting instructions, right before the "Stay within the supported Markdown subset" callout):

```markdown
Compose all such bullets as one Markdown bullet-list block — the
`next-steps` placeholder value.
```

Insert a new paragraph immediately after it (before the "**Stay within the supported Markdown subset**" paragraph):

```markdown
Set the `screenshots` placeholder to the literal string `N/A`, unconditionally
— never ask whether screenshots exist. Real image attachment depends on map
item **I.5** (jira-client attachment upload, not built as of this writing,
owned separately from Q) — asking now would be a dead end with nothing to
attach to. Once I.5 ships, this step is the place to revisit.
```

- [ ] **Step 3: Edit `skills/generate-comment/SKILL.md`'s Quick Reference table**

Find this row:

```markdown
| 2 | Progress Update content: N's `report.html` or session summary, Next Steps role/mention resolution, today's date |
```

Replace it with:

```markdown
| 2 | Progress Update content: N's `report.html` or session summary, Next Steps role/mention resolution, screenshots placeholder (always `N/A` for now), today's date |
```

- [ ] **Step 4: Read both edited files back in full**

Confirm: `progress-update.md`'s new section sits in the right position (between "All links" and "Next Steps", with correct emoji and a blank line before/after `<screenshots>` matching the existing sections' spacing style); `SKILL.md`'s Step 2 reads coherently with the new paragraph in place (no dangling reference, no duplicate "Stay within the supported Markdown subset" callout); the Quick Reference row matches Step 2's actual content.

- [ ] **Step 5: Commit**

```bash
git add skills/generate-comment/templates/progress-update.md skills/generate-comment/SKILL.md
git commit -m "feat(generate-comment): add Screenshots/Videos section to progress-update.md"
```
