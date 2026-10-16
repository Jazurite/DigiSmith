# DGS-492 plan: close the Review Mode gaps

Spec: `design.html` (a9dbb60). Files: `skills/voice/SKILL.md`, `standards/global/ai-writing-tells.md`. No test script exists; each task ends with a read-back check.

## Task 1: SKILL.md, Review Mode step 5 (gaps 1, 2, 3)
Replace step 5 with: table output (pattern number or `STE`, strength, quoted text, fix), "Top 5" above the groups, groups by section of the text with strongest first, header line "counted by sighting". Keep the remaining-tells list, the rewrite and the write-back rule.
Check: step 5 names all four columns, the Top 5, the order and the counting line.

## Task 2: SKILL.md, Review Mode step 6 (gap 8)
Add: for readers outside the team, flag an undefined acronym or term for the author; never define it unless the source gives the definition.
Check: the rule is in step 6 once.

## Task 3: ai-writing-tells.md, rows 19 and 20 (gaps 5, 4)
Row 19: bold stays on a label that carries information the sentence does not repeat. Row 20: add the proper-name rule for linked page titles and the "written for effect" test. Do not change the carve-out sentence.
Check: `git diff` shows the carve-out sentence unchanged.

## Task 4: ai-writing-tells.md, rows 22 and 25, "When not to act" (gaps 6, 7)
Row 22: sign-offs in a document are a tell. "When not to act": the sign-off exemption holds only in a letter, an email or a comment addressed to a person. Row 25: add draft placeholders.
Check: row 22 and "When not to act" agree.

## Task 5: whole-branch check
Read both files; confirm each of the 8 points once; no em dashes added; commit per task, title-only conventional commits.
