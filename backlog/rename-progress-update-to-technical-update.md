# Rename the `progress-update` comment template to `technical-update`

**ClickUp:** **DGS-262** (list F.7: Report and sync, clan F: Scripture; created 2026-10-10 ~17:3x UTC+7 by the clan F work, task id `14zcebrvctr`).

**Status:** Idea only, confirmed live twice. No design yet. Filed as a task chip 2026-10-02.

**Source:** Live session 2026-10-02 (Claude desktop-app session "Main", manager mode: one Claude session managed herdr worker agents on EMKT-791 and EMKT-810). Full retro: [manager-mode-retro-2026-10-02.md](manager-mode-retro-2026-10-02.md).

## What's wrong

Jack changed every DigiSmith JIRA comment heading by hand from "📣 Progress Update – D/M" to
"📣 Technical Update – D/M" (EMKT-791 comment 3467894, EMKT-810 comment 3468302). He also
shortened the links line to "👆 All links are in the ticket description above." and removed it,
and the screenshots line, when nothing exists yet.

## The idea

Rename `skills/generate-comment/templates/progress-update.md` to `technical-update.md`, with the
new heading and links line. Update every reference: `generate-comment` SKILL.md (Steps 1, 1.5, 2,
Error Handling), `jira-progress-write-back` (Step 4, the Step 9 type mapping, Step 10's dedup
search on the heading prefix), `scripts/fill-template.ts` and its tests, and any other mention
(grep, do not trust this list). Decide how dedup treats old comments that still say
"Progress Update". Consider making the links and screenshots lines optional placeholders.

## Why not applied yet

Needs Jack's approval on the design. The RichText-to-ADF item
([richtext-to-adf.md](richtext-to-adf.md)) may move templates to HTML. Use the new name there.
